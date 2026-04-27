import { MongoClient, ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth/context";

const MONGO_URI = process.env.MONGODB_URI!;
const MONGO_DB = process.env.MONGODB_DB_NAME ?? "atlas";

let _mongoClient: MongoClient | null = null;
function getMongoCollection() {
  if (!_mongoClient) _mongoClient = new MongoClient(MONGO_URI);
  return _mongoClient.db(MONGO_DB).collection("reasoning_traces");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ signal_id: string }> }
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { signal_id } = await params;

  let oid: ObjectId;
  try {
    oid = new ObjectId(signal_id);
  } catch {
    return Response.json({ error: "Invalid signal ID" }, { status: 400 });
  }

  try {
    const col = getMongoCollection();
    const doc = await col.findOne({ _id: oid, user_id: user.userId });
    if (!doc) return Response.json({ error: "Signal not found" }, { status: 404 });

    const run = (doc.pipeline_run ?? {}) as Record<string, unknown>;
    const decision = (run.final_decision ?? {}) as Record<string, unknown>;
    const exec = (doc.execution ?? {}) as Record<string, unknown>;
    const analystOutputs = (run.analyst_outputs ?? {}) as Record<string, unknown>;

    // Build full trace from stored pipeline_run structure
    const trace = {
      technical: analystOutputs.technical ?? run.technical ?? null,
      fundamental: analystOutputs.fundamental ?? run.fundamental ?? null,
      sentiment: analystOutputs.sentiment ?? run.sentiment ?? null,
      synthesis: run.synthesis ?? null,
      risk: run.risk ?? null,
      portfolio_decision: run.final_decision ?? null,
    };

    return Response.json({
      id: doc._id.toHexString(),
      ticker: String(doc.ticker ?? ""),
      action: String(decision.action ?? "HOLD"),
      confidence: Number(decision.confidence ?? 0),
      reasoning: String(decision.reasoning ?? ""),
      boundary_mode: String(doc.boundary_mode ?? run.boundary_mode ?? "advisory"),
      risk: run.risk ?? {},
      created_at:
        doc.created_at instanceof Date
          ? doc.created_at.toISOString()
          : String(doc.created_at ?? ""),
      status: (exec.status ?? "signal") as string,
      execution: doc.execution ?? null,
      shares: Number(exec.shares ?? 0) || null,
      price: Number(exec.price ?? 0) || null,
      trace,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
