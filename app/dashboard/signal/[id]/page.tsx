import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { MongoClient, ObjectId } from "mongodb";
import { SignalDetailClient, type Signal, type TracePanel } from "./SignalDetailClient";

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { id } = await params;

  const signal = await fetchSignal(userId, id);
  if (!signal) notFound();

  return <SignalDetailClient signal={signal} />;
}

async function fetchSignal(userId: string, id: string): Promise<Signal | null> {
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }

  const mongo = new MongoClient(process.env.MONGODB_URI!);
  try {
    await mongo.connect();
    const doc = await mongo
      .db(process.env.MONGODB_DB_NAME ?? "atlas")
      .collection("reasoning_traces")
      .findOne({ _id: oid, user_id: userId });

    if (!doc) return null;

    const run = (doc.pipeline_run ?? {}) as Record<string, unknown>;
    const decision = (run.final_decision ?? {}) as Record<string, unknown>;
    const exec = (doc.execution ?? {}) as Record<string, unknown>;
    const analystOutputs = (run.analyst_outputs ?? {}) as Record<string, unknown>;

    const rawAction = String(decision.action ?? "HOLD").toUpperCase();
    const action: Signal["action"] =
      rawAction === "BUY" || rawAction === "SELL" ? rawAction : "HOLD";

    const rawStatus = String(exec.status ?? "");
    const status: Signal["status"] | undefined =
      rawStatus === "awaiting_approval" || rawStatus === "rejected" || rawStatus === "executed"
        ? rawStatus
        : undefined;

    const risk = (run.risk ?? {}) as Signal["risk"];

    return {
      id: doc._id.toHexString(),
      ticker: String(doc.ticker ?? ""),
      action,
      confidence: Number(decision.confidence ?? 0),
      reasoning: String(decision.reasoning ?? ""),
      boundary_mode: String(doc.boundary_mode ?? run.boundary_mode ?? "advisory"),
      risk,
      created_at:
        doc.created_at instanceof Date
          ? doc.created_at.toISOString()
          : String(doc.created_at ?? ""),
      status,
      trace: {
        technical: analystOutputs.technical ?? run.technical ?? undefined,
        fundamental: analystOutputs.fundamental ?? run.fundamental ?? undefined,
        sentiment: analystOutputs.sentiment ?? run.sentiment ?? undefined,
        synthesis: run.synthesis ?? undefined,
        risk: run.risk ?? undefined,
        portfolio_decision: run.final_decision ?? undefined,
      } as TracePanel,
    };
  } catch {
    return null;
  } finally {
    await mongo.close();
  }
}
