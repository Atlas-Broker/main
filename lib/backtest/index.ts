/**
 * Public API for the Atlas backtest library.
 *
 * Usage:
 *   import { runBacktest, computeMetrics } from "@/lib/backtest"
 */

export { inngest } from "./inngest-client";
export { computeMetrics } from "./metrics";
export { generateDateRange, markJobComplete, runBacktest, upsertSlice } from "./runner";
export { VirtualPortfolio } from "./simulator";
export type { Position as VirtualPosition, TradeResult } from "./simulator";
export type {
  BacktestJob,
  BacktestMetrics,
  BacktestRequest,
  BacktestSlice,
} from "./types";
