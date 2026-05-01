/**
 * Resolves per-user Alpaca credentials from the broker_connections table.
 * Uses the service role key so it works in server-only contexts (Inngest, agent nodes).
 */

import { createClient } from "@supabase/supabase-js"

export interface AlpacaCredentials {
  apiKey: string
  secretKey: string
  paper: boolean
}

let _client: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    _client = createClient(url, key, { auth: { persistSession: false } })
  }
  return _client
}

export async function getBrokerCredentials(userId: string): Promise<AlpacaCredentials> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from("broker_connections")
    .select("api_key, api_secret, environment")
    .eq("user_id", userId)
    .eq("broker", "alpaca")
    .eq("is_active", true)
    .single() as { data: { api_key: string; api_secret: string; environment: string } | null; error: unknown }

  if (error || !data?.api_key || !data?.api_secret) {
    throw new Error(
      `No active Alpaca connection found for user ${userId}. ` +
        `Connect your Alpaca account in Settings first.`
    )
  }

  return {
    apiKey: data.api_key,
    secretKey: data.api_secret,
    paper: data.environment === "paper",
  }
}
