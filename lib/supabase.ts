import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Creates an authenticated Supabase client using a Clerk JWT
 * (from the "atlas-supabase" template). RLS policies use
 * auth.jwt() ->> 'sub' to scope rows to the current user.
 */
export function createSupabaseClient(clerkToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${clerkToken}` },
    },
    auth: { persistSession: false },
  });
}
