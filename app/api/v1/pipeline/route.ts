/**
 * POST /api/v1/pipeline/run — trigger a pipeline run for a ticker.
 *
 * Fires an Inngest "app/pipeline.triggered" event and returns immediately.
 * The signal appears in /v1/signals when the run completes.
 *
 * Port of backend/api/routes/pipeline.py.
 */
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";
import { inngest } from "@/lib/inngest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const VALID_PHILOSOPHIES = ["balanced", "buffett", "soros", "lynch"] as const;
const VALID_MODES = ["advisory", "autonomous", "autonomous_guardrail"] as const;

const PipelineRequestSchema = z.object({
  ticker: z.string().default("AAPL"),
  boundary_mode: z.enum(VALID_MODES).default("advisory"),
  philosophy_mode: z.enum(VALID_PHILOSOPHIES).nullable().optional(),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }

  const parsed = PipelineRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { ticker, boundary_mode, philosophy_mode } = parsed.data;

  // Resolve philosophy: use provided value or fall back to user's profile setting
  let resolvedPhilosophy: string = philosophy_mode ?? "balanced";
  if (!philosophy_mode) {
    try {
      const sb = getServiceClient();
      const { data } = await sb
        .from("profiles")
        .select("investment_philosophy")
        .eq("id", user.userId)
        .maybeSingle();
      if (data && (data as Record<string, unknown>)["investment_philosophy"]) {
        resolvedPhilosophy = String((data as Record<string, unknown>)["investment_philosophy"]);
      }
    } catch {
      // fall back to balanced
    }
  }

  await inngest.send({
    name: "app/pipeline.triggered",
    data: {
      userId: user.userId,
      ticker: ticker.trim().toUpperCase(),
      boundaryMode: boundary_mode,
      philosophyMode: resolvedPhilosophy,
      triggeredAt: new Date().toISOString(),
    },
  });

  return Response.json({
    status: "queued",
    ticker: ticker.trim().toUpperCase(),
    boundary_mode,
    philosophy_mode: resolvedPhilosophy,
    message: "Pipeline run queued. Signal will appear in /v1/signals when complete.",
  });
}
