/**
 * Inngest function: on-pipeline-triggered
 *
 * Handles "app/pipeline.triggered" events emitted by the dispatcher.
 * Invokes the agent graph (runGraph) for the given user/ticker and, in
 * autonomous mode with low confidence, dispatches a notification event for
 * the notification service (sprint 013) to pick up.
 */

import { inngest } from "../inngest"
import { runGraph } from "../agents"
import type { RunGraphOptions } from "../agents"
import { executeTrade } from "./execute-trade"

const LOW_CONFIDENCE_THRESHOLD = 0.65

export const onPipelineTriggered = inngest.createFunction(
  { id: "on-pipeline-triggered", triggers: [{ event: "app/pipeline.triggered" }] },
  async ({ event, step }: { event: { data: Record<string, unknown> }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { userId, ticker, philosophy, mode, asOfDate } = event.data as {
      userId: string
      ticker: string
      philosophy: string
      mode: "advisory" | "autonomous"
      asOfDate: string
    }

    const result = await step.run("run-graph", async () => {
      try {
        return await runGraph(ticker, {
          mode,
          philosophy,
          isBacktest: false,
          userId,
        } as RunGraphOptions)
      } catch (err) {
        console.error("[pipeline] runGraph failed:", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : "")
        throw err
      }
    })

    const confidence = result.portfolio_decision?.confidence ?? 1

    // Live trade execution — gated to autonomous mode + non-HOLD action +
    // EBC green/yellow + confidence above the gate. Idempotent on signal_id.
    // See lib/scheduler/execute-trade.ts for the full trigger table.
    const tradeOutcome = await step.run("execute-trade", async () => {
      return executeTrade({
        userId,
        ticker,
        mode,
        signalId: result.trace_id ?? undefined,
        portfolioDecision: result.portfolio_decision ?? undefined,
        risk: result.risk ?? undefined,
      })
    })

    // In autonomous mode with low confidence → notify the user.
    // Skip the notification if a trade actually executed (the order itself
    // is the notification at that point).
    if (
      mode === "autonomous" &&
      confidence < LOW_CONFIDENCE_THRESHOLD &&
      tradeOutcome.skipped
    ) {
      await step.run("notify-low-confidence", async () => {
        await inngest.send({
          name: "app/notification.requested",
          data: { userId, ticker, result },
        })
      })
    }

    return result
  }
)
