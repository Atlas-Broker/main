/**
 * POST   /api/v1/experiments        — create an experiment (admin only)
 * GET    /api/v1/experiments        — list experiments with jobs (admin only)
 * DELETE /api/v1/experiments/:id   — handled in [exp_id]/route.ts
 *
 * Port of backend/api/routes/experiments.py.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getUserFromRequest } from "@/lib/auth/context";
import { inngest } from "@/lib/inngest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const PHILOSOPHIES = ["lynch", "soros", "buffett", "balanced"] as const;
const THRESHOLDS = [0.5, 0.65, 0.8, 0.95];
const EBC_MODES = ["advisory", "autonomous_guardrail", "autonomous"] as const;

const VariantSpecSchema = z.object({
  philosophy_mode: z.string().default("balanced"),
  confidence_threshold: z.number().nullable().optional(),
});

const ExperimentRequestSchema = z.object({
  experiment_type: z.enum(["philosophy", "threshold", "single", "custom"]),
  name: z.string(),
  tickers: z.array(z.string()).min(1).max(10).transform((arr) => arr.map((t) => t.trim().toUpperCase())),
  start_date: z.string().date(),
  end_date: z.string().date(),
  ebc_mode: z.enum(EBC_MODES),
  philosophy_mode: z.string().default("balanced"),
  confidence_threshold: z.number().nullable().optional(),
  initial_capital: z.number().default(100_000),
  custom_variants: z.array(VariantSpecSchema).optional(),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

async function requireAdmin(req: Request): Promise<{ userId: string } | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const sb = getServiceClient();
  const { data } = await sb.from("profiles").select("role").eq("id", user.userId).maybeSingle();
  const role = (data as Record<string, unknown> | null)?.["role"] as string | undefined;
  return role && ["admin", "superadmin"].includes(role) ? user : null;
}

function buildVariants(req: z.infer<typeof ExperimentRequestSchema>) {
  if (req.experiment_type === "philosophy") {
    return PHILOSOPHIES.map((p) => ({ philosophy_mode: p, confidence_threshold: req.confidence_threshold ?? null }));
  }
  if (req.experiment_type === "threshold") {
    return THRESHOLDS.map((t) => ({ philosophy_mode: req.philosophy_mode, confidence_threshold: t }));
  }
  if (req.experiment_type === "custom" && req.custom_variants?.length) {
    return req.custom_variants.map((v) => ({ philosophy_mode: v.philosophy_mode, confidence_threshold: v.confidence_threshold ?? null }));
  }
  return [{ philosophy_mode: req.philosophy_mode, confidence_threshold: req.confidence_threshold ?? null }];
}

export async function GET(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sb = getServiceClient();
  const { data: experiments, error } = await sb
    .from("backtest_experiments")
    .select("*")
    .eq("user_id", admin.userId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: jobs } = await sb
    .from("backtest_jobs")
    .select("*")
    .eq("user_id", admin.userId);

  const jobsByExp: Record<string, unknown[]> = {};
  for (const job of jobs ?? []) {
    const eid = (job as Record<string, unknown>)["experiment_id"] as string | undefined;
    if (eid) {
      jobsByExp[eid] = [...(jobsByExp[eid] ?? []), job];
    }
  }

  return Response.json(
    (experiments ?? []).map((exp) => ({
      ...exp,
      jobs: jobsByExp[(exp as Record<string, unknown>)["id"] as string] ?? [],
    })),
  );
}

export async function POST(req: Request): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = ExperimentRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  // Date range validation
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(data.end_date);
  const startDate = new Date(data.start_date);
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  if (endDate >= cutoff) {
    return Response.json({ error: "end_date must be at least 2 days in the past" }, { status: 422 });
  }
  if (endDate <= startDate) {
    return Response.json({ error: "end_date must be after start_date" }, { status: 422 });
  }
  const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > 90) {
    return Response.json({ error: "Date range cannot exceed 90 days" }, { status: 422 });
  }

  const sb = getServiceClient();
  const expId = randomUUID();

  await sb.from("backtest_experiments").insert({
    id: expId,
    user_id: admin.userId,
    name: data.name,
    experiment_type: data.experiment_type,
    tickers: data.tickers,
    start_date: data.start_date,
    end_date: data.end_date,
    ebc_mode: data.ebc_mode,
  });

  const variants = buildVariants(data);
  const jobIds: string[] = [];

  for (const variant of variants) {
    const jobId = randomUUID();
    jobIds.push(jobId);

    await sb.from("backtest_jobs").insert({
      id: jobId,
      user_id: admin.userId,
      tickers: data.tickers,
      start_date: data.start_date,
      end_date: data.end_date,
      ebc_mode: data.ebc_mode,
      philosophy_mode: variant.philosophy_mode,
      confidence_threshold: variant.confidence_threshold,
      experiment_id: expId,
      initial_capital: data.initial_capital,
      status: "pending",
    });

    await inngest.send({
      name: "app/backtest.requested",
      data: {
        jobId,
        userId: admin.userId,
        tickers: data.tickers,
        startDate: data.start_date,
        endDate: data.end_date,
        ebcMode: data.ebc_mode,
        philosophy: variant.philosophy_mode,
        confidenceThreshold: variant.confidence_threshold,
        initialCapital: data.initial_capital,
      },
    });
  }

  return Response.json({ experiment_id: expId, job_ids: jobIds, status: "launched" }, { status: 201 });
}
