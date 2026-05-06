/**
 * POST /api/v1/signals/:signal_id/approve — approve and execute a signal.
 *
 * Port of backend/services/signals_service.py approve_and_execute().
 */
import { MongoClient, ObjectId } from "mongodb";
import { createClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/auth/context";
import { AlpacaAdapter } from "@/lib/broker/alpaca";
import { getEffectiveGate } from "@/lib/boundary/circuit-breaker";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;
const MONGO_URI = process.env.MONGODB_URI!;
const MONGO_DB = process.env.MONGODB_DB_NAME ?? "atlas";
const NOTIONAL_USD = 1000.0;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ signal_id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { signal_id } = await params;
  let oid: ObjectId;
  try {
    oid = new ObjectId(signal_id);
  } catch {
    return Response.json({ error: "Invalid signal_id format" }, { status: 400 });
  }

  const mongo = new MongoClient(MONGO_URI);
  try {
    await mongo.connect();
    const col = mongo.db(MONGO_DB).collection("reasoning_traces");

    const trace = await col.findOne({ _id: oid }) as Record<string, unknown> | null;
    if (!trace) return Response.json({ error: "Signal not found" }, { status: 404 });
    if (trace["user_id"] !== user.userId) {
      return Response.json({ error: "Signal not found" }, { status: 404 });
    }

    const execution = (trace["execution"] ?? {}) as Record<string, unknown>;
    if (execution["executed"]) {
      return Response.json({ error: "Signal has already been executed." }, { status: 409 });
    }

    const pipelineRun = (trace["pipeline_run"] ?? {}) as Record<string, unknown>;
    const decision = (pipelineRun["final_decision"] ?? {}) as Record<string, unknown>;
    const ticker = String(trace["ticker"] ?? "");
    const action = String(decision["action"] ?? "HOLD");
    const boundaryMode = String(trace["boundary_mode"] ?? "advisory");

    if (action === "HOLD") {
      return Response.json({ status: "skipped", message: "HOLD signal — no order placed." });
    }

    // EBC circuit breaker gate — apply before any broker call
    const gate = await getEffectiveGate(user.userId);
    if (!gate.canExecute) {
      return Response.json({
        status: "blocked",
        ebc_state: gate.state,
        message: gate.reason ?? "EBC circuit breaker is active — execution paused.",
      });
    }
    const confidence = parseFloat(String(decision["confidence"] ?? "0"));
    if (confidence < gate.confidenceGate) {
      return Response.json({
        status: "blocked",
        ebc_state: gate.state,
        message: `Signal confidence ${confidence.toFixed(2)} is below the EBC gate (${gate.confidenceGate}) for ${gate.state} state.`,
      });
    }
    const effectiveNotional = NOTIONAL_USD * gate.notionalMultiplier;

    // Fetch broker credentials
    const sb = getServiceClient();
    const { data: conn } = await sb
      .from("broker_connections")
      .select("api_key, api_secret, environment")
      .eq("user_id", user.userId)
      .eq("broker", "alpaca")
      .eq("active", true)
      .maybeSingle();

    if (!conn) {
      return Response.json(
        { error: "No broker connected. Connect your Alpaca account in Settings before approving signals." },
        { status: 422 },
      );
    }

    const connRow = conn as Record<string, unknown>;
    const adapter = new AlpacaAdapter(
      String(connRow["api_key"]),
      String(connRow["api_secret"]),
      connRow["environment"] === "paper",
    );

    const order = await adapter.submitOrder({ ticker, action: action as "BUY" | "SELL", notional: effectiveNotional });

    // Persist trade to Supabase — failure must not fail the response
    let supabaseSync = true;
    try {
      const { data: portfolio } = await sb
        .from("portfolios")
        .select("id")
        .eq("user_id", user.userId)
        .maybeSingle();

      const portfolioId = (portfolio as Record<string, unknown> | null)?.["id"] as string | undefined;

      await sb.from("trades").insert({
        user_id: user.userId,
        portfolio_id: portfolioId ?? null,
        ticker,
        action,
        shares: order.qty ?? 0,
        price: 0, // filled price not known at order time for market orders
        status: "filled",
        boundary_mode: boundaryMode,
        signal_id: signal_id,
        order_id: order.orderId,
        executed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Supabase write failed after order placement:", err);
      supabaseSync = false;
    }

    // Update MongoDB trace
    await col.updateOne(
      { _id: oid },
      { $set: { execution: { executed: true, order_id: order.orderId, status: "filled" } } },
    );

    return Response.json({
      status: "executed",
      order_id: order.orderId,
      ticker,
      action,
      ebc_state: gate.state,
      notional: effectiveNotional,
      message: `Order placed: ${action} $${effectiveNotional} of ${ticker}.`,
      supabase_sync: supabaseSync,
    });
  } finally {
    await mongo.close();
  }
}
