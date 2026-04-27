/**
 * Inngest function: run-tournament
 *
 * Triggered by the "atlas/tournament.requested" event.
 *
 * Runs identical backtest variants across multiple LLM providers in sequential
 * rounds. Each round fans out to one backtest-per-variant, ranks survivors, and
 * passes the top-N to the next round. Idempotent: current_round is persisted in
 * Supabase so a re-run after failure resumes from the interrupted round.
 */

import { createClient } from "@supabase/supabase-js";
import { MongoClient } from "mongodb";
import { randomUUID } from "crypto";

import { runGraph } from "../agents";
import { inngest } from "../inngest";
import { computeMetrics } from "./metrics";
import { VirtualPortfolio } from "./simulator";
import { generateDateRange, upsertSlice } from "./runner";
import type { AtlasState } from "../agents/state";
import {
  rankVariants,
  crossModelConsistency,
  type TournamentConfig,
  type TournamentResult,
  type VariantResult,
  type RoundResult,
  type BacktestVariant,
} from "./tournament";

// ─── Env / clients ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const MONGO_URI = process.env["MONGODB_URI"];
const DB_NAME = "atlas";
const TOURNAMENT_RESULTS_COLLECTION = "tournament_results";

type PhilosophyMap = Record<string, "balanced" | "buffett" | "soros" | "lynch">;

/** Map tournament philosophies to agent graph philosophy modes. */
const PHILOSOPHY_MAP: PhilosophyMap = {
  growth:   "lynch",
  value:    "buffett",
  momentum: "soros",
  balanced: "balanced",
};

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function getMongoClient(): MongoClient {
  if (!MONGO_URI) throw new Error("MONGODB_URI is not configured");
  return new MongoClient(MONGO_URI);
}

// ─── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchTournamentJob(id: string): Promise<Record<string, unknown>> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("tournament_jobs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(`Tournament job ${id} not found: ${error?.message}`);
  return data as Record<string, unknown>;
}

async function updateTournamentJob(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from("tournament_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to update tournament_jobs: ${error.message}`);
}

// ─── MongoDB helper ────────────────────────────────────────────────────────────

async function saveTournamentResult(result: TournamentResult): Promise<void> {
  const client = getMongoClient();
  try {
    await client.connect();
    const col = client.db(DB_NAME).collection(TOURNAMENT_RESULTS_COLLECTION);
    await col.replaceOne(
      { tournament_id: result.tournament_id },
      { ...result, savedAt: new Date().toISOString() },
      { upsert: true },
    );
  } finally {
    await client.close();
  }
}

// ─── Variant execution (plain async, not wrapped in step) ──────────────────────

async function executeVariant(
  variant: BacktestVariant,
  config: TournamentConfig,
  roundIndex: number,
): Promise<VariantResult> {
  const jobId = randomUUID();
  const round = config.rounds[roundIndex];
  const llmConfig = round.provider;
  const dates = generateDateRange(config.start_date, config.end_date);
  const { tickers, user_id: userId } = config;
  const agentPhilosophy = PHILOSOPHY_MAP[variant.philosophy] ?? "balanced";

  const rawSlices = [];
  for (const date of dates) {
    for (const ticker of tickers) {
      const decision = await runGraph(ticker, {
        userId,
        mode: variant.mode,
        philosophy: agentPhilosophy,
        isBacktest: true,
        asOfDate: date,
        llmConfig,
      });
      await upsertSlice(jobId, date, ticker, decision, {
        provider: llmConfig.provider,
        model: llmConfig.model,
        base_url: llmConfig.baseUrl,
      });
      rawSlices.push({
        jobId,
        date,
        ticker,
        decision,
        completedAt: new Date().toISOString(),
      });
    }
  }

  // Post-loop simulation pass — mirrors runner.ts
  const portfolio = new VirtualPortfolio();
  const lastDate = dates[dates.length - 1];

  const backtestSlices = rawSlices.map((slice) => {
    const agentState = slice.decision as AtlasState;
    const pd = agentState.portfolio_decision;
    const currentPrice = agentState.current_price ?? null;

    const tradeResult = portfolio.process({
      date: slice.date,
      ticker: slice.ticker,
      action: pd?.action ?? "HOLD",
      confidence: pd?.confidence ?? 0,
      ebcMode: variant.mode,
      executionPrice: currentPrice,
      isLastDay: slice.date === lastDate,
    });

    const portfolioValueAfter = portfolio.portfolioValue(
      currentPrice !== null ? { [slice.ticker]: currentPrice } : {},
    );

    return {
      ...slice,
      decision: {
        ...(agentState as Record<string, unknown>),
        executed: tradeResult.executed,
        pnl: tradeResult.pnl ?? null,
        portfolio_value_after: portfolioValueAfter,
      },
    };
  });

  const metrics = computeMetrics(backtestSlices);

  return {
    variant,
    job_id: jobId,
    sharpe: metrics.sharpeRatio,
    cagr: metrics.cagr,
    calmar: metrics.calmarRatio,
    status: "completed",
  };
}

// ─── Inngest function ──────────────────────────────────────────────────────────

export const runTournament = inngest.createFunction(
  {
    id: "run-tournament",
    name: "Run Tournament",
    triggers: [{ event: "atlas/tournament.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { tournament_id: string; user_id: string } };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const { tournament_id } = event.data;

    // Step 1: Load and validate config
    const { config, startRound } = await step.run("load-config", async () => {
      const row = await fetchTournamentJob(tournament_id);
      const cfg = row["config"] as TournamentConfig;
      if (!cfg.variants || cfg.variants.length === 0) {
        throw new Error("Tournament config must have at least one variant");
      }
      if (!cfg.rounds || cfg.rounds.length === 0) {
        throw new Error("Tournament config must have at least one round");
      }
      return { config: cfg, startRound: (row["current_round"] as number) ?? 0 };
    });

    let survivors: BacktestVariant[] = config.variants;
    const roundResults: RoundResult[] = [];

    // Steps 2..N: sequential rounds (each step wraps an entire round)
    for (let i = startRound; i < config.rounds.length; i++) {
      const round = config.rounds[i];

      // Update status before running the round
      await step.run(`update-round-${i}`, async () => {
        await updateTournamentJob(tournament_id, { status: "running", current_round: i });
      });

      const currentSurvivors = survivors; // capture for closure

      const roundResult = await step.run(`round-${i}`, async (): Promise<RoundResult> => {
        const results: VariantResult[] = [];
        for (const variant of currentSurvivors) {
          try {
            const vr = await executeVariant(variant, config, i);
            results.push(vr);
          } catch {
            results.push({
              variant,
              job_id: randomUUID(),
              sharpe: null,
              cagr: null,
              calmar: null,
              status: "failed",
            });
          }
        }

        const ranked = rankVariants(results, config.rank_by);
        const nextSurvivors = ranked
          .slice(0, round.top_n)
          .filter((r) => r.status === "completed")
          .map((r) => r.variant);

        return {
          round_index: i,
          provider: round.provider.provider,
          model: round.provider.model,
          results: ranked,
          survivors: nextSurvivors,
        };
      });

      roundResults.push(roundResult);
      survivors = roundResult.survivors;

      if (survivors.length === 0) {
        await step.run(`fail-no-survivors-${i}`, async () => {
          await updateTournamentJob(tournament_id, { status: "failed" });
        });
        return { tournament_id, status: "failed", reason: `no survivors after round ${i}` };
      }
    }

    // Final step: persist results
    await step.run("finalize", async () => {
      const winner = survivors[0] ?? null;
      const runnerUp = survivors[1] ?? null;
      const consistency = crossModelConsistency(roundResults);

      const result: TournamentResult = {
        tournament_id,
        rounds: roundResults,
        winner,
        runner_up: runnerUp,
        cross_model_consistency: consistency,
      };

      await saveTournamentResult(result);
      await updateTournamentJob(tournament_id, { status: "completed" });
    });

    return { tournament_id, status: "completed" };
  },
);
