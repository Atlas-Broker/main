/**
 * POST /api/v1/backtest  — create a new backtest job and publish to Inngest.
 * GET  /api/v1/backtest  — list all backtest jobs for the authenticated user.
 *
 * Response shape parity with backend/api/routes/backtest.py.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";
import { inngest } from "@/lib/inngest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const VALID_EBC_MODES = ["advisory", "autonomous_guardrail", "autonomous"] as const;
const VALID_PHILOSOPHY_MODES = ["balanced", "buffett", "soros", "lynch"] as const;

const BacktestRequestSchema = z.object({
  tickers: z
    .array(z.string().min(1).max(5))
    .min(1)
    .max(10)
    .transform((ts) => ts.map((t) => t.trim().toUpperCase())),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date required"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date required"),
  ebc_mode: z.enum(VALID_EBC_MODES),
  philosophy_mode: z.enum(VALID_PHILOSOPHY_MODES).default("balanced"),
  confidence_threshold: z.number().min(0).max(1).nullable().optional(),
  initial_capital: z.number().positive().default(100_000.0),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = BacktestRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const body = parsed.data;

  // Validate date logic
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(body.end_date);
  const startDate = new Date(body.start_date);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  if (endDate > twoDaysAgo) {
    return Response.json(
      { error: "end_date must be at least 2 days in the past" },
      { status: 422 }
    );
  }
  if (endDate <= startDate) {
    return Response.json(
      { error: "end_date must be after start_date" },
      { status: 422 }
    );
  }
  const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 90) {
    return Response.json(
      { error: "Date range cannot exceed 90 days" },
      { status: 422 }
    );
  }

  const sb = getServiceClient();

  // Check concurrent job limit
  const jobsResult = await sb
    .from("backtest_jobs")
    .select("id, status")
    .eq("user_id", user.userId);

  const jobs = jobsResult.data ?? [];
  const runningCount = jobs.filter((j) => (j as Record<string, unknown>)["status"] === "running").length;

  // Default limit — admin/superadmin limits handled by backend if needed
  const maxConcurrent = 1;
  if (runningCount >= maxConcurrent) {
    return Response.json(
      { error: `Maximum ${maxConcurrent} concurrent backtests reached for your plan.` },
      { status: 429 }
    );
  }

  const jobId = randomUUID();

  // Write pending job to Supabase
  const { error: insertError } = await sb.from("backtest_jobs").insert({
    id: jobId,
    user_id: user.userId,
    tickers: body.tickers,
    start_date: body.start_date,
    end_date: body.end_date,
    ebc_mode: body.ebc_mode,
    philosophy_mode: body.philosophy_mode,
    confidence_threshold: body.confidence_threshold ?? null,
    initial_capital: body.initial_capital,
    status: "queued",
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  // Publish event to Inngest
  await inngest.send({
    name: "atlas/backtest.run",
    data: {
      job_id: jobId,
      user_id: user.userId,
      tickers: body.tickers,
      start_date: body.start_date,
      end_date: body.end_date,
      ebc_mode: body.ebc_mode,
      philosophy_mode: body.philosophy_mode,
      confidence_threshold: body.confidence_threshold ?? null,
      initial_capital: body.initial_capital,
    },
  });

  return Response.json({ job_id: jobId, status: "queued" }, { status: 201 });
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();

  try {
    const { data, error } = await sb
      .from("backtest_jobs")
      .select("*")
      .eq("user_id", user.userId)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
