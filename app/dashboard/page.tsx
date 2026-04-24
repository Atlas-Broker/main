import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MongoClient } from "mongodb";
import { getServiceClient } from "@/lib/supabase-server";
import UserDashboard, { type DashboardInitialData, type Signal } from "./DashboardClient";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const sb = getServiceClient();

  const [{ data: portfolio }, { data: profile }, signals] = await Promise.all([
    sb.from("portfolios").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
    fetchSignals(userId),
  ]);

  const p = profile as Record<string, unknown> | null;
  const VALID_TIERS = ["free", "pro", "max"] as const;
  const rawTier = String(p?.["tier"] ?? "free");
  const tier = (VALID_TIERS.includes(rawTier as typeof VALID_TIERS[number]) ? rawTier : "free") as DashboardInitialData["tier"];

  const initialData: DashboardInitialData = {
    portfolio: portfolio as DashboardInitialData["portfolio"],
    signals,
    role: (p?.["role"] as DashboardInitialData["role"]) ?? null,
    tier,
    philosophy: (p?.["investment_philosophy"] as DashboardInitialData["philosophy"]) ?? "balanced",
    boundaryMode: String(p?.["boundary_mode"] ?? "advisory"),
  };

  return <UserDashboard initialData={initialData} />;
}

async function fetchSignals(userId: string): Promise<Signal[]> {
  const mongo = new MongoClient(process.env.MONGODB_URI!);
  try {
    await mongo.connect();
    const docs = await mongo
      .db(process.env.MONGODB_DB_NAME ?? "atlas")
      .collection("reasoning_traces")
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(20)
      .toArray();

    return docs.map((d) => {
      const run = (d.pipeline_run ?? {}) as Record<string, unknown>;
      const decision = (run.final_decision ?? {}) as Record<string, unknown>;
      const exec = (d.execution ?? {}) as Record<string, unknown>;
      return {
        id: String(d._id),
        ticker: String(d.ticker ?? ""),
        action: String(decision.action ?? "HOLD") as Signal["action"],
        confidence: Number(decision.confidence ?? 0),
        reasoning: String(decision.reasoning ?? ""),
        boundary_mode: String(d.boundary_mode ?? "advisory"),
        risk: (run.risk ?? {}) as Signal["risk"],
        created_at: String(d.created_at ?? new Date().toISOString()),
        status: exec.status as Signal["status"],
        execution: d.execution as Signal["execution"],
      };
    });
  } catch {
    return [];
  } finally {
    await mongo.close();
  }
}
