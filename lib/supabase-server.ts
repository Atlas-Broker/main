import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

/**
 * Server-only Supabase client (service role key — never sent to the browser).
 * All queries MUST include an explicit .eq("user_id", userId) filter.
 * userId always comes from Clerk's auth() on the server, which is trusted.
 *
 * RLS is the secondary backstop for anon-key client-side usage.
 */
export function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}
