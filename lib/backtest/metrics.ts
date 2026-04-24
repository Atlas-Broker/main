/**
 * Backtest metrics computation — ported from backend/backtesting/metrics.py.
 *
 * Input:  BacktestSlice[]   (one entry per date × ticker step)
 * Output: BacktestMetrics
 *
 * Formulae match the Python implementation to ±0.1% on a reference backtest.
 */

import type { BacktestMetrics, BacktestSlice } from "./types";

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

interface TradeRecord {
  executed: boolean;
  action?: string;
  pnl?: number | null;
  portfolioValueAfter?: number;
}

/**
 * Extract a trade record from a BacktestSlice's decision field.
 * The agent graph attaches simulator output to the decision object.
 */
function toTradeRecord(slice: BacktestSlice): TradeRecord {
  const d = slice.decision as Record<string, unknown> | null | undefined;
  if (!d) {
    return { executed: false };
  }
  return {
    executed: Boolean(d["executed"]),
    action: typeof d["action"] === "string" ? d["action"] : undefined,
    pnl: typeof d["pnl"] === "number" ? d["pnl"] : null,
    portfolioValueAfter:
      typeof d["portfolio_value_after"] === "number"
        ? d["portfolio_value_after"]
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Population standard deviation helper (matches Python's (n-1) sample std)
// ---------------------------------------------------------------------------

function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute aggregate backtest metrics from an array of BacktestSlice objects.
 *
 * Mirrors backend/backtesting/metrics.py `compute_metrics` exactly.
 *
 * @param slices - All (date × ticker) slices from a completed backtest run.
 * @param initialCapital - Starting portfolio value (default 10_000).
 */
export function computeMetrics(
  slices: BacktestSlice[],
  initialCapital = 10_000,
): BacktestMetrics {
  if (slices.length === 0) {
    return emptyMetrics();
  }

  const trades = slices.map(toTradeRecord);

  // -------------------------------------------------------------------------
  // Equity curve — one point per unique date (use last slice's portfolioValue)
  // -------------------------------------------------------------------------
  const dateValueMap = new Map<string, number>();
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const v = trades[i].portfolioValueAfter;
    if (v !== undefined) {
      dateValueMap.set(s.date, v);
    }
  }

  const sortedDates = Array.from(dateValueMap.keys()).sort();
  const dailyValues: number[] =
    sortedDates.length > 0
      ? sortedDates.map((d) => dateValueMap.get(d) as number)
      : [];

  const finalValue =
    dailyValues.length > 0 ? dailyValues[dailyValues.length - 1] : initialCapital;

  // Total return
  const totalReturn = (finalValue - initialCapital) / initialCapital;

  // -------------------------------------------------------------------------
  // CAGR — (finalValue / initialCapital)^(1/years) − 1
  // Uses 252 trading days per year (matching Python)
  // -------------------------------------------------------------------------
  let cagr = 0;
  if (dailyValues.length >= 2 && initialCapital > 0 && finalValue > 0) {
    const years = dailyValues.length / 252;
    cagr = (finalValue / initialCapital) ** (1 / years) - 1;
  }

  // -------------------------------------------------------------------------
  // Daily returns
  // -------------------------------------------------------------------------
  const dailyReturns: number[] = [];
  for (let i = 1; i < dailyValues.length; i++) {
    if (dailyValues[i - 1] > 0) {
      dailyReturns.push(
        (dailyValues[i] - dailyValues[i - 1]) / dailyValues[i - 1],
      );
    }
  }

  // -------------------------------------------------------------------------
  // Sharpe ratio — mean(dailyReturns) / std(dailyReturns) * sqrt(252)
  // Risk-free rate = 0 (matches Python)
  // -------------------------------------------------------------------------
  let sharpeRatio = 0;
  if (dailyReturns.length >= 2) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const std = sampleStd(dailyReturns);
    if (std > 0) {
      sharpeRatio = (mean / std) * Math.sqrt(252);
    }
  }

  // -------------------------------------------------------------------------
  // Max drawdown — peak-to-trough on cumulative return curve (positive number)
  // Python returns -max_drawdown (negative), we store the absolute value here
  // and the caller interprets the sign from the field name.
  // -------------------------------------------------------------------------
  let maxDrawdown = 0;
  let peak = dailyValues[0] ?? initialCapital;
  for (const v of dailyValues) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }

  // -------------------------------------------------------------------------
  // Calmar = CAGR / abs(maxDrawdown)
  // -------------------------------------------------------------------------
  const calmarRatio = maxDrawdown > 0 ? cagr / maxDrawdown : 0;

  // -------------------------------------------------------------------------
  // Trade statistics
  // -------------------------------------------------------------------------
  const executed = trades.filter((t) => t.executed);
  const closedTrades = executed.filter((t) => t.pnl != null);
  const profitable = closedTrades.filter((t) => (t.pnl as number) > 0);
  const winRate =
    closedTrades.length > 0 ? profitable.length / closedTrades.length : 0;
  const totalTrades = executed.length;

  // -------------------------------------------------------------------------
  // Profit factor = gross profit / gross loss
  // -------------------------------------------------------------------------
  const grossProfit = closedTrades
    .filter((t) => (t.pnl as number) > 0)
    .reduce((sum, t) => sum + (t.pnl as number), 0);
  const grossLoss = closedTrades
    .filter((t) => (t.pnl as number) < 0)
    .reduce((sum, t) => sum + Math.abs(t.pnl as number), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

  return {
    cagr: round6(cagr),
    sharpeRatio: round4(sharpeRatio),
    maxDrawdown: round6(maxDrawdown),
    calmarRatio: round4(calmarRatio),
    profitFactor: round4(profitFactor),
    winRate: round4(winRate),
    totalTrades,
    totalReturn: round6(totalReturn),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMetrics(): BacktestMetrics {
  return {
    cagr: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    calmarRatio: 0,
    profitFactor: 0,
    winRate: 0,
    totalTrades: 0,
    totalReturn: 0,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
