/**
 * Core types for the Atlas backtest library.
 *
 * BacktestRequest  — input to trigger a backtest job
 * BacktestSlice    — result of one (date × ticker) step
 * BacktestMetrics  — aggregate performance metrics
 * BacktestJob      — job status document persisted in MongoDB
 */

import type { LLMConfig } from "@/lib/agents/llm";

export type { LLMConfig } from "@/lib/agents/llm";

export interface BacktestRequest {
  userId: string;
  tickers: string[];
  /** ISO "YYYY-MM-DD" */
  startDate: string;
  /** ISO "YYYY-MM-DD" */
  endDate: string;
  philosophy: "buffett" | "soros" | "lynch" | "balanced";
  /** Pre-generated UUID — used for idempotency on Inngest replay. */
  jobId: string;
  /**
   * Optional LLM provider config.  Defaults to Gemini when absent.
   * Live trading always ignores this field.
   */
  llmConfig?: LLMConfig;
}

export interface BacktestSlice {
  jobId: string;
  date: string;
  ticker: string;
  /** PortfolioDecision returned by the agent graph. */
  decision: unknown;
  completedAt: string;
}

export interface BacktestMetrics {
  cagr: number;
  sharpeRatio: number;
  maxDrawdown: number;
  calmarRatio: number;
  profitFactor: number;
  winRate: number;
  totalTrades: number;
  totalReturn: number;
}

export interface BacktestJob {
  jobId: string;
  userId: string;
  status: "pending" | "running" | "completed" | "failed";
  /** 0–1 */
  progress: number;
  metrics?: BacktestMetrics;
  createdAt: string;
  completedAt?: string;
}
