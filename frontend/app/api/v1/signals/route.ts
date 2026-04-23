/**
 * GET  /api/v1/signals             — list recent signals for the authenticated user.
 * POST /api/v1/signals/:id/approve — handled separately (not in this sprint scope).
 *
 * Response shape parity with backend/api/routes/signals.py.
 */
import { MongoClient, ObjectId, BSON } from "mongodb";
import { getUserFromRequest } from "@/lib/auth/context";

const MONGO_URI = process.env.MONGODB_URI!;
const MONGO_DB = process.env.MONGODB_DB_NAME ?? "atlas";
const MAX_LIMIT = 50;

let _mongoClient: MongoClient | null = null;

function getMongoCollection() {
  if (!_mongoClient) {
    _mongoClient = new MongoClient(MONGO_URI);
  }
  return _mongoClient.db(MONGO_DB).collection("reasoning_traces");
}

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = Math.min(
    rawLimit ? Math.max(1, parseInt(rawLimit, 10)) : 20,
    MAX_LIMIT
  );

  try {
    const col = getMongoCollection();
    const traces = await col
      .find(
        { user_id: user.userId },
        {
          projection: {
            _id: 1,
            "pipeline_run.final_decision": 1,
            "pipeline_run.risk": 1,
            "pipeline_run.boundary_mode": 1,
            "execution.executed": 1,
            "execution.shares": 1,
            "execution.price": 1,
            created_at: 1,
            ticker: 1,
          },
        }
      )
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();

    const signals = traces.map((trace) => {
      const pipelineRun = (trace["pipeline_run"] as Record<string, unknown>) ?? {};
      const decision = (pipelineRun["final_decision"] as Record<string, unknown>) ?? {};
      const risk = (pipelineRun["risk"] as Record<string, unknown>) ?? {};
      const execution = (trace["execution"] as Record<string, unknown>) ?? {};

      const createdAt = trace["created_at"];
      const createdStr =
        createdAt instanceof Date
          ? createdAt.toISOString()
          : String(createdAt ?? "");

      const id = trace["_id"] instanceof ObjectId
        ? trace["_id"].toHexString()
        : String(trace["_id"] ?? "");

      return {
        id,
        ticker: String(trace["ticker"] ?? ""),
        action: String(decision["action"] ?? "HOLD"),
        confidence: Number(decision["confidence"] ?? 0),
        reasoning: String(decision["reasoning"] ?? ""),
        boundary_mode: String(pipelineRun["boundary_mode"] ?? "advisory"),
        status: "signal",
        risk: {
          stop_loss: Number(risk["stop_loss"] ?? 0),
          take_profit: Number(risk["take_profit"] ?? 0),
          position_size: Number(risk["position_size"] ?? 0),
          risk_reward_ratio: Number(risk["risk_reward_ratio"] ?? 0),
        },
        created_at: createdStr,
        trace: null,
        execution: execution ?? null,
        shares: Number(execution["shares"] ?? 0) || null,
        price: Number(execution["price"] ?? 0) || null,
      };
    });

    return Response.json(signals);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
