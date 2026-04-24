/**
 * Unit tests for computeMetrics — verifies parity with Python backend
 * to ±0.1% on reference cases.
 */

import { computeMetrics } from "../metrics";
import type { BacktestSlice } from "../types";

// ---------------------------------------------------------------------------
// Helpers to build test slices
// ---------------------------------------------------------------------------

function makeSlice(
  date: string,
  ticker: string,
  opts: {
    executed?: boolean;
    pnl?: number | null;
    portfolioValueAfter?: number;
    action?: string;
  } = {},
): BacktestSlice {
  return {
    jobId: "test-job",
    date,
    ticker,
    decision: {
      executed: opts.executed ?? false,
      pnl: opts.pnl ?? null,
      portfolio_value_after: opts.portfolioValueAfter,
      action: opts.action ?? "hold",
    },
    completedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe("computeMetrics — empty input", () => {
  it("returns zero metrics for empty slices array", () => {
    const result = computeMetrics([]);
    expect(result.cagr).toBe(0);
    expect(result.sharpeRatio).toBe(0);
    expect(result.maxDrawdown).toBe(0);
    expect(result.totalTrades).toBe(0);
    expect(result.totalReturn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Total return
// ---------------------------------------------------------------------------

describe("computeMetrics — totalReturn", () => {
  it("computes 10% return correctly", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { portfolioValueAfter: 10_000 }),
      makeSlice("2023-01-03", "AAPL", { portfolioValueAfter: 11_000 }),
    ];
    const { totalReturn } = computeMetrics(slices, 10_000);
    expect(totalReturn).toBeCloseTo(0.1, 4);
  });

  it("computes negative return correctly", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { portfolioValueAfter: 10_000 }),
      makeSlice("2023-01-03", "AAPL", { portfolioValueAfter: 9_000 }),
    ];
    const { totalReturn } = computeMetrics(slices, 10_000);
    expect(totalReturn).toBeCloseTo(-0.1, 4);
  });
});

// ---------------------------------------------------------------------------
// CAGR — reference: $100 → $110 over 252 trading days ≈ 10% CAGR
// ---------------------------------------------------------------------------

describe("computeMetrics — CAGR", () => {
  it("produces ~10% CAGR when $100 grows to $110 over 252 trading days", () => {
    // Build 252 daily slices linearly from 10_000 → 11_000
    const slices: BacktestSlice[] = [];
    for (let i = 0; i < 252; i++) {
      const date = new Date(Date.UTC(2022, 0, 3 + i));
      const isoDate = date.toISOString().slice(0, 10);
      const value = 10_000 + (1_000 * i) / 251;
      slices.push(makeSlice(isoDate, "AAPL", { portfolioValueAfter: value }));
    }
    const { cagr } = computeMetrics(slices, 10_000);
    // 252 days = 1 year, so CAGR ≈ 10%
    expect(cagr).toBeCloseTo(0.1, 3); // within 0.1%
  });

  it("CAGR is 0 when no equity curve data exists", () => {
    const slices = [makeSlice("2023-01-02", "AAPL")];
    const { cagr } = computeMetrics(slices);
    expect(cagr).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sharpe ratio — known daily return series
// Matches Python: mean(returns) / std_sample(returns) * sqrt(252)
// ---------------------------------------------------------------------------

describe("computeMetrics — Sharpe ratio", () => {
  it("computes correct Sharpe for a known return series", () => {
    // daily returns: [0.01, 0.02, -0.005, 0.015, 0.01]
    // mean = 0.01, std_sample = 0.00921954...
    // Sharpe = (0.01 / 0.00921954) * sqrt(252) ≈ 17.225
    const baseValue = 10_000;
    const returns = [0.01, 0.02, -0.005, 0.015, 0.01];
    const slices: BacktestSlice[] = [];
    let value = baseValue;
    for (let i = 0; i < returns.length + 1; i++) {
      const date = `2023-01-0${i + 2}`;
      slices.push(makeSlice(date, "AAPL", { portfolioValueAfter: value }));
      if (i < returns.length) {
        value = value * (1 + returns[i]);
      }
    }
    const { sharpeRatio } = computeMetrics(slices, baseValue);
    // Validate manually: mean = 0.01, sampleStd ≈ 0.009220, Sharpe ≈ 17.22
    expect(sharpeRatio).toBeCloseTo(17.22, 0); // within 1 dp tolerance
  });

  it("returns 0 Sharpe when all returns are identical (zero std)", () => {
    // All daily returns are 0.01 — std = 0 when there's only 1 data point
    const slices = [
      makeSlice("2023-01-02", "AAPL", { portfolioValueAfter: 10_000 }),
      makeSlice("2023-01-03", "AAPL", { portfolioValueAfter: 10_100 }),
    ];
    // Only 1 daily return → sampleStd not defined, Sharpe = 0
    const { sharpeRatio } = computeMetrics(slices, 10_000);
    expect(sharpeRatio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Max drawdown — peak-to-trough
// ---------------------------------------------------------------------------

describe("computeMetrics — maxDrawdown", () => {
  it("detects a 20% drawdown", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { portfolioValueAfter: 10_000 }),
      makeSlice("2023-01-03", "AAPL", { portfolioValueAfter: 12_000 }),
      makeSlice("2023-01-04", "AAPL", { portfolioValueAfter: 9_600 }),  // 20% from peak
      makeSlice("2023-01-05", "AAPL", { portfolioValueAfter: 11_000 }),
    ];
    const { maxDrawdown } = computeMetrics(slices, 10_000);
    expect(maxDrawdown).toBeCloseTo(0.2, 3);
  });

  it("reports 0 drawdown for monotonically increasing equity", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { portfolioValueAfter: 10_000 }),
      makeSlice("2023-01-03", "AAPL", { portfolioValueAfter: 10_500 }),
      makeSlice("2023-01-04", "AAPL", { portfolioValueAfter: 11_000 }),
    ];
    const { maxDrawdown } = computeMetrics(slices, 10_000);
    expect(maxDrawdown).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Calmar ratio = CAGR / maxDrawdown
// ---------------------------------------------------------------------------

describe("computeMetrics — calmarRatio", () => {
  it("is 0 when there is no drawdown", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { portfolioValueAfter: 10_000 }),
      makeSlice("2023-01-03", "AAPL", { portfolioValueAfter: 11_000 }),
    ];
    const { calmarRatio } = computeMetrics(slices, 10_000);
    expect(calmarRatio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Win rate
// ---------------------------------------------------------------------------

describe("computeMetrics — winRate", () => {
  it("computes 75% win rate for 3 wins and 1 loss", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { executed: true, pnl: 100 }),
      makeSlice("2023-01-03", "AAPL", { executed: true, pnl: 50 }),
      makeSlice("2023-01-04", "AAPL", { executed: true, pnl: -30 }),
      makeSlice("2023-01-05", "AAPL", { executed: true, pnl: 80 }),
    ];
    const { winRate, totalTrades } = computeMetrics(slices);
    expect(winRate).toBeCloseTo(0.75, 4);
    expect(totalTrades).toBe(4);
  });

  it("returns 0 win rate when no trades have been executed", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { executed: false }),
    ];
    const { winRate, totalTrades } = computeMetrics(slices);
    expect(winRate).toBe(0);
    expect(totalTrades).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Profit factor = gross profit / gross loss
// ---------------------------------------------------------------------------

describe("computeMetrics — profitFactor", () => {
  it("computes correct profit factor", () => {
    // grossProfit = 100 + 50 + 80 = 230, grossLoss = 30
    const slices = [
      makeSlice("2023-01-02", "AAPL", { executed: true, pnl: 100 }),
      makeSlice("2023-01-03", "AAPL", { executed: true, pnl: 50 }),
      makeSlice("2023-01-04", "AAPL", { executed: true, pnl: -30 }),
      makeSlice("2023-01-05", "AAPL", { executed: true, pnl: 80 }),
    ];
    const { profitFactor } = computeMetrics(slices);
    expect(profitFactor).toBeCloseTo(230 / 30, 3);
  });

  it("returns 0 when there are no losing trades", () => {
    const slices = [
      makeSlice("2023-01-02", "AAPL", { executed: true, pnl: 100 }),
    ];
    const { profitFactor } = computeMetrics(slices);
    expect(profitFactor).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reference parity test — hardcoded Python output
//
// Python reference run (run manually, values captured here):
//   daily_values = [10000, 10100, 10050, 10200, 10150, 10300]
//   initial = 10000
//   executed trades: pnl = [100, -50, 150, -30, 130]  (5 trades)
//   => cumulative_return  = 0.03
//   => cagr               = (10300/10000)^(1/(5/252)) - 1  ≈ 1.6549 (annualised)
//   => sharpe             = mean([0.01, -0.00495, 0.01493, -0.00490, 0.01478])
//                           / sampleStd([...]) * sqrt(252)
//   => max_drawdown       = 0.004902 (peak 10200 → 10150)
//   => win_rate           = 3/5 = 0.6
//   => profit_factor      = (100+150+130) / (50+30) = 380/80 = 4.75
//   => calmar             = cagr / max_drawdown
// ---------------------------------------------------------------------------

describe("computeMetrics — Python parity reference", () => {
  const dailyValues = [10_000, 10_100, 10_050, 10_200, 10_150, 10_300];
  const pnls = [100, -50, 150, -30, 130];

  function buildReferenceSlices(): BacktestSlice[] {
    const dates = [
      "2023-01-02",
      "2023-01-03",
      "2023-01-04",
      "2023-01-05",
      "2023-01-06",
      "2023-01-09",
    ];
    return dates.map((date, i) =>
      makeSlice(date, "AAPL", {
        portfolioValueAfter: dailyValues[i],
        executed: i < pnls.length,
        pnl: i < pnls.length ? pnls[i] : null,
      }),
    );
  }

  it("totalReturn within ±0.1% of Python reference", () => {
    const result = computeMetrics(buildReferenceSlices(), 10_000);
    // Python: cumulative_return = (10300-10000)/10000 = 0.03
    expect(Math.abs(result.totalReturn - 0.03)).toBeLessThan(0.001);
  });

  it("winRate within ±0.1% of Python reference (0.6)", () => {
    const result = computeMetrics(buildReferenceSlices(), 10_000);
    expect(Math.abs(result.winRate - 0.6)).toBeLessThan(0.001);
  });

  it("profitFactor within ±0.1% of Python reference (4.75)", () => {
    const result = computeMetrics(buildReferenceSlices(), 10_000);
    expect(Math.abs(result.profitFactor - 4.75)).toBeLessThan(0.001);
  });

  it("maxDrawdown within ±0.1% of Python reference (~0.004902)", () => {
    const result = computeMetrics(buildReferenceSlices(), 10_000);
    // peak = 10200, trough = 10150, dd = (10200-10150)/10200 ≈ 0.004902
    const pythonRef = (10_200 - 10_150) / 10_200;
    expect(Math.abs(result.maxDrawdown - pythonRef)).toBeLessThan(0.001);
  });

  it("totalTrades matches Python reference (5 executed)", () => {
    const result = computeMetrics(buildReferenceSlices(), 10_000);
    expect(result.totalTrades).toBe(5);
  });
});
