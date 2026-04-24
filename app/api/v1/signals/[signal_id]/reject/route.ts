/**
 * POST /api/v1/signals/:signal_id/reject — reject a signal.
 *
 * Port of backend/services/signals_service.py reject_signal().
 */
import { MongoClient, ObjectId } from "mongodb";
import { getUserFromRequest } from "@/lib/auth/context";

const MONGO_URI = process.env.MONGODB_URI!;
const MONGO_DB = process.env.MONGODB_DB_NAME ?? "atlas";

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
    return Response.json({ error: "Invalid signal ID format" }, { status: 400 });
  }

  const mongo = new MongoClient(MONGO_URI);
  try {
    await mongo.connect();
    const col = mongo.db(MONGO_DB).collection("reasoning_traces");

    const trace = await col.findOne({ _id: oid, user_id: user.userId }) as Record<string, unknown> | null;
    if (!trace) return Response.json({ error: "Signal not found" }, { status: 404 });

    const execution = (trace["execution"] ?? {}) as Record<string, unknown>;
    if (execution["executed"]) {
      return Response.json({ error: "Signal has already been executed" }, { status: 409 });
    }
    if (execution["rejected"]) {
      return Response.json({ signal_id, status: "rejected", message: "Signal already rejected" });
    }

    await col.updateOne(
      { _id: oid },
      {
        $set: {
          "execution.rejected": true,
          "execution.rejected_at": new Date().toISOString(),
          "execution.status": "rejected",
        },
      },
    );

    return Response.json({
      signal_id,
      status: "rejected",
      message: "Signal rejected and logged",
    });
  } finally {
    await mongo.close();
  }
}
