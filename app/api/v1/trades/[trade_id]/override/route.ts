/**
 * POST /api/v1/trades/:trade_id/override — cancel a trade within its 5-minute override window.
 *
 * Steps:
 *   1. Look up trade — 404 if not found or not owned by user.
 *   2. Idempotency: return 200 immediately if already overridden.
 *   3. Window check: 409 if elapsed > 300s.
 *   4. Attempt broker order cancellation (log failure, never propagate).
 *   5. Write override_log audit record.
 *   6. Update trade status to "overridden".
 *
 * Port of backend/services/trade_service.py cancel_and_log().
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";
import { AlpacaAdapter } from "@/lib/broker/alpaca";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;
const OVERRIDE_WINDOW_S = 300;

const OverrideBodySchema = z.object({
  reason: z.string().optional(),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ trade_id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let reason: string | undefined;
  try {
    const body = await req.json();
    const parsed = OverrideBodySchema.safeParse(body);
    if (parsed.success) reason = parsed.data.reason;
  } catch {
    // reason remains undefined — acceptable
  }

  const sb = getServiceClient();
  const { trade_id } = await params;

  const { data: trade, error: fetchError } = await sb
    .from("trades")
    .select("*")
    .eq("id", trade_id)
    .eq("user_id", user.userId)
    .maybeSingle();

  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  if (!trade) return Response.json({ error: "Trade not found" }, { status: 404 });

  // Idempotency
  if ((trade as Record<string, unknown>)["status"] === "overridden") {
    return Response.json({ success: true, message: "Trade already overridden" });
  }

  // Override window check
  const executedAt = new Date(String((trade as Record<string, unknown>)["executed_at"]));
  const elapsed = (Date.now() - executedAt.getTime()) / 1000;
  if (elapsed > OVERRIDE_WINDOW_S) {
    return Response.json(
      { error: "Override window has closed (5 min limit)" },
      { status: 409 },
    );
  }

  // Attempt broker cancellation — fetch user's broker credentials
  let brokerCancelSuccess = false;
  try {
    const { data: conn } = await sb
      .from("broker_connections")
      .select("api_key, api_secret, environment")
      .eq("user_id", user.userId)
      .eq("broker", "alpaca")
      .maybeSingle();

    if (conn) {
      const adapter = new AlpacaAdapter(
        String((conn as Record<string, unknown>)["api_key"]),
        String((conn as Record<string, unknown>)["api_secret"]),
        (conn as Record<string, unknown>)["environment"] === "paper",
      );
      await adapter.cancelOrder(String((trade as Record<string, unknown>)["order_id"]));
      brokerCancelSuccess = true;
    }
  } catch (err) {
    console.error("Broker cancel_order failed:", err);
  }

  // Write audit log
  try {
    await sb.from("override_log").insert({
      user_id: user.userId,
      trade_id,
      order_id: (trade as Record<string, unknown>)["order_id"],
      ticker: (trade as Record<string, unknown>)["ticker"],
      reason: reason ?? "user_initiated",
      broker_cancel_success: brokerCancelSuccess,
      overridden_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("override_log write failed:", err);
  }

  // Update trade status
  await sb
    .from("trades")
    .update({ status: "overridden" })
    .eq("id", trade_id)
    .eq("user_id", user.userId);

  if (brokerCancelSuccess) {
    return Response.json({ success: true, message: "Order cancelled successfully" });
  }
  return Response.json({
    success: false,
    message:
      "Override logged but broker could not cancel the order — it may have already been filled",
  });
}
