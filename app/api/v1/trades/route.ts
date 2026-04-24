/**
 * GET /api/v1/trades — return the user's trade history from Supabase.
 *
 * Response shape parity with backend/api/routes/trades.py.
 */
import { createClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/auth/context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("trades")
    .select("id, ticker, action, shares, price, status, boundary_mode, executed_at, order_id")
    .eq("user_id", user.userId)
    .order("executed_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
