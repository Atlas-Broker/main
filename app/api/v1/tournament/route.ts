/**
 * POST /api/v1/tournament — create a new tournament job and publish to Inngest.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";
import { inngest } from "@/lib/inngest";
import { PROVIDER_DEFAULTS } from "@/lib/agents/llm";
import type { LLMProvider } from "@/lib/agents/llm";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const VALID_PHILOSOPHIES = ["growth", "value", "momentum", "balanced"] as const;
const VALID_MODES = ["advisory", "autonomous"] as const;
const VALID_PROVIDERS = ["gemini", "groq", "ollama", "openai-compatible"] as const;
const VALID_RANK_BY = ["sharpe", "cagr", "calmar"] as const;

const BacktestVariantSchema = z.object({
  philosophy: z.enum(VALID_PHILOSOPHIES),
  mode: z.enum(VALID_MODES),
  label: z.string().min(1).max(128),
});

const TournamentRoundSchema = z.object({
  provider: z.object({
    provider: z.enum(VALID_PROVIDERS),
    model: z.string().min(1).max(128),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().max(512).optional(),
  }),
  top_n: z.number().int().min(1).max(4),
});

const TournamentRequestSchema = z.object({
  tickers: z
    .array(z.string().min(1).max(5))
    .min(1)
    .max(10)
    .transform((ts) => ts.map((t) => t.trim().toUpperCase())),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date required"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date required"),
  variants: z.array(BacktestVariantSchema).min(1).max(8),
  rounds: z.array(TournamentRoundSchema).min(1).max(3),
  rank_by: z.enum(VALID_RANK_BY).default("sharpe"),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function resolveModel(provider: LLMProvider, model?: string): string {
  if (model && model.trim()) return model.trim();
  return PROVIDER_DEFAULTS[provider]["quick"];
}

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

  const parsed = TournamentRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const body = parsed.data;

  const id = randomUUID();
  const config = {
    id,
    user_id: user.userId,
    tickers: body.tickers,
    start_date: body.start_date,
    end_date: body.end_date,
    variants: body.variants,
    rounds: body.rounds.map((r) => ({
      ...r,
      provider: {
        ...r.provider,
        model: resolveModel(r.provider.provider as LLMProvider, r.provider.model),
      },
    })),
    rank_by: body.rank_by,
  };

  const sb = getServiceClient();

  const { error: insertError } = await sb.from("tournament_jobs").insert({
    id,
    user_id: user.userId,
    status: "pending",
    config,
    current_round: 0,
    total_rounds: body.rounds.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  await inngest.send({
    name: "atlas/tournament.requested",
    data: { tournament_id: id, user_id: user.userId },
  });

  return Response.json({ id, status: "pending" }, { status: 201 });
}
