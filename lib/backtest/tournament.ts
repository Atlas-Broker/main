/**
 * Tournament types and helpers for cross-model LLM backtesting.
 *
 * A tournament runs identical backtest configurations (variants) across
 * multiple LLM providers in progressive rounds. Each round runs all surviving
 * variants, ranks them by a metric, and keeps the top N survivors.
 */

import type { LLMConfig } from "@/lib/agents/llm";

export type { LLMConfig };

// ─── Domain types ──────────────────────────────────────────────────────────────

export type Philosophy = "growth" | "value" | "momentum" | "balanced";

export type BacktestVariant = {
  philosophy: Philosophy;
  mode: "advisory" | "autonomous";
  label: string;
};

export type TournamentRound = {
  provider: LLMConfig;
  top_n: number;
};

export type TournamentConfig = {
  id: string;
  user_id: string;
  tickers: string[];
  start_date: string;
  end_date: string;
  variants: BacktestVariant[];
  rounds: TournamentRound[];
  rank_by: "sharpe" | "cagr" | "calmar";
};

export type VariantResult = {
  variant: BacktestVariant;
  job_id: string;
  sharpe: number | null;
  cagr: number | null;
  calmar: number | null;
  status: "completed" | "failed";
};

export type RoundResult = {
  round_index: number;
  provider: string;
  model: string;
  results: VariantResult[];
  survivors: BacktestVariant[];
};

export type TournamentResult = {
  tournament_id: string;
  rounds: RoundResult[];
  winner: BacktestVariant | null;
  runner_up: BacktestVariant | null;
  /** 0–1: fraction of rounds that agreed on winner */
  cross_model_consistency: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sort variant results descending by the chosen metric.
 * Null values are treated as -Infinity (sorted last).
 */
export function rankVariants(
  results: VariantResult[],
  by: "sharpe" | "cagr" | "calmar",
): VariantResult[] {
  const score = (r: VariantResult): number => {
    const v = r[by];
    return v === null ? -Infinity : v;
  };
  return [...results].sort((a, b) => score(b) - score(a));
}

/**
 * Returns the fraction of rounds whose top survivor matches the overall winner
 * (the top survivor of the last round). Returns 1.0 if there is only one round.
 */
export function crossModelConsistency(rounds: RoundResult[]): number {
  if (rounds.length <= 1) return 1.0;

  const lastRound = rounds[rounds.length - 1];
  if (!lastRound || lastRound.survivors.length === 0) return 0;

  const winner = lastRound.survivors[0];
  const matchCount = rounds.filter((r) => {
    const top = r.survivors[0];
    return top && top.label === winner.label;
  }).length;

  return matchCount / rounds.length;
}
