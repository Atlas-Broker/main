/**
 * Scheduler dispatcher.
 *
 * Queries Supabase for users who have a given schedule window enabled, then
 * publishes an "app/pipeline.triggered" Inngest event for each (user, ticker)
 * pair. Uses the service-role key so RLS is bypassed — this is server-only code.
 */

import { createClient } from "@supabase/supabase-js"
import { inngest } from "../inngest"
import type { ScheduleWindow, PipelineEvent } from "./types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!

/**
 * Returns Supabase rows from `user_schedules` where window_name matches and
 * is_enabled is true.
 */
export async function queryEnabledUsers(
  window: ScheduleWindow
): Promise<Array<{ user_id: string; ticker: string; mode: "advisory" | "autonomous"; philosophy: string }>> {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await client
    .from("user_schedules")
    .select("user_id, ticker, mode, philosophy")
    .eq("window_name", window)
    .eq("is_enabled", true)

  if (error) {
    console.warn(`[Scheduler] Supabase query failed for window "${window}":`, error.message)
    return []
  }

  return (data ?? []) as Array<{
    user_id: string
    ticker: string
    mode: "advisory" | "autonomous"
    philosophy: string
  }>
}

/**
 * Publishes Inngest pipeline events for all (user, ticker) pairs that have
 * the given window enabled.
 */
export async function publishPipelineEvents(
  window: ScheduleWindow,
  rows: Array<{ user_id: string; ticker: string; mode: "advisory" | "autonomous"; philosophy: string }>
): Promise<void> {
  if (rows.length === 0) {
    return
  }

  const asOfDate = new Date().toISOString().slice(0, 10)

  const events: PipelineEvent[] = rows.map((row) => ({
    name: "app/pipeline.triggered" as const,
    data: {
      userId: row.user_id,
      ticker: row.ticker,
      philosophy: row.philosophy,
      mode: row.mode,
      asOfDate,
    },
  }))

  await inngest.send(events)
}

/**
 * Main dispatch entry point called by each cron function.
 * Returns the number of pipeline events published.
 */
export async function dispatch(
  window: ScheduleWindow
): Promise<{ triggered_count: number }> {
  const startMs = Date.now()

  let rows: Array<{ user_id: string; ticker: string; mode: "advisory" | "autonomous"; philosophy: string }>
  try {
    rows = await queryEnabledUsers(window)
  } catch (err) {
    console.warn(`[Scheduler] Unexpected error querying users for window "${window}":`, err)
    rows = []
  }

  if (rows.length === 0) {
    const duration_ms = Date.now() - startMs
    console.info(`[Scheduler] window=${window} | triggered_count=0 | duration_ms=${duration_ms} | (no-op)`)
    return { triggered_count: 0 }
  }

  try {
    await publishPipelineEvents(window, rows)
  } catch (err) {
    console.warn(`[Scheduler] Failed to publish pipeline events for window "${window}":`, err)
    return { triggered_count: 0 }
  }

  const triggered_count = rows.length
  const duration_ms = Date.now() - startMs

  console.info(
    `[Scheduler] window=${window} | triggered_count=${triggered_count} | duration_ms=${duration_ms}`
  )

  return { triggered_count }
}
