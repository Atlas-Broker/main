/**
 * Philosophy axis experiment — run locally without Inngest or auth.
 *
 * Runs 4 variants (balanced × advisory/autonomous, buffett × advisory/autonomous)
 * against a single ticker over a short date range using Groq.
 *
 * Usage:
 *   npx tsx --env-file .env.local scripts/run-philosophy-experiment.ts
 */

import { runGraph } from "../lib/agents";
import { VirtualPortfolio } from "../lib/backtest/simulator";
import { computeMetrics } from "../lib/backtest/metrics";
import { generateDateRange } from "../lib/backtest/runner";
import type { AtlasState } from "../lib/agents/state";
import type { LLMConfig } from "../lib/agents/llm";

// ─── Experiment config ─────────────────────────────────────────────────────────

const TICKER = "AAPL";
const START_DATE = "2024-01-02";
const END_DATE = "2024-01-26"; // ~18 trading days — enough signal, fast enough to run

const LLM: LLMConfig = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
};

const VARIANTS: Array<{
  label: string;
  philosophy: "balanced" | "buffett" | "soros" | "lynch";
  mode: "advisory" | "autonomous";
}> = [
  { label: "balanced-advisory",    philosophy: "balanced", mode: "advisory"   },
  { label: "balanced-autonomous",  philosophy: "balanced", mode: "autonomous" },
  { label: "buffett-advisory",     philosophy: "buffett",  mode: "advisory"   },
  { label: "buffett-autonomous",   philosophy: "buffett",  mode: "autonomous" },
];

// ─── Variant runner ────────────────────────────────────────────────────────────

async function runVariant(
  variant: (typeof VARIANTS)[number],
  dates: string[],
): Promise<ReturnType<typeof computeMetrics> & { label: string; trades_detail: string[] }> {
  const rawSlices = [];

  for (const date of dates) {
    process.stdout.write(".");
    const decision = await runGraph(TICKER, {
      userId: "experiment-local",
      mode: variant.mode,
      philosophy: variant.philosophy,
      isBacktest: true,
      asOfDate: date,
      llmConfig: LLM,
    });
    rawSlices.push({
      jobId: "exp",
      date,
      ticker: TICKER,
      decision,
      completedAt: new Date().toISOString(),
    });
  }

  // Simulation pass
  const portfolio = new VirtualPortfolio();
  const lastDate = dates[dates.length - 1];
  const tradesDetail: string[] = [];

  const slices = rawSlices.map((slice) => {
    const state = slice.decision as AtlasState;
    const pd = state.portfolio_decision;
    const price = state.current_price ?? null;

    const trade = portfolio.process({
      date: slice.date,
      ticker: TICKER,
      action: pd?.action ?? "HOLD",
      confidence: pd?.confidence ?? 0,
      ebcMode: variant.mode,
      executionPrice: price,
      isLastDay: slice.date === lastDate,
    });

    if (trade.executed) {
      tradesDetail.push(
        `${slice.date} ${trade.action} ${trade.shares?.toFixed(2)}sh @ $${trade.price?.toFixed(2)} (conf=${pd?.confidence?.toFixed(2)})`,
      );
    }

    return {
      ...slice,
      decision: {
        ...(state as Record<string, unknown>),
        executed: trade.executed,
        pnl: trade.pnl ?? null,
        portfolio_value_after: portfolio.portfolioValue(price ? { [TICKER]: price } : {}),
      },
    };
  });

  const metrics = computeMetrics(slices);
  return { ...metrics, label: variant.label, trades_detail: tradesDetail };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dates = generateDateRange(START_DATE, END_DATE);

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Atlas — Philosophy Axis Experiment (Groq Round)      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Ticker: ${TICKER}  |  ${START_DATE} → ${END_DATE}  |  ${dates.length} trading days`);
  console.log(`Model: ${LLM.model}\n`);

  const results: Array<ReturnType<typeof computeMetrics> & { label: string; trades_detail: string[]; error?: string }> = [];

  for (const variant of VARIANTS) {
    process.stdout.write(`\n▶ ${variant.label.padEnd(24)} `);
    try {
      const r = await runVariant(variant, dates);
      results.push(r);
      console.log(` ✓`);
    } catch (err) {
      console.log(` ✗`);
      console.error(`  Error: ${err}`);
      results.push({
        label: variant.label,
        trades_detail: [],
        error: String(err),
        cagr: 0, sharpeRatio: 0, maxDrawdown: 0, calmarRatio: 0,
        profitFactor: 0, winRate: 0, totalTrades: 0, totalReturn: 0,
      });
    }
  }

  // ─── Results table ───────────────────────────────────────────────────────────

  console.log("\n\n══════════════════════ RESULTS ══════════════════════════\n");

  const sorted = [...results].sort(
    (a, b) => (b.error ? -1 : b.sharpeRatio) - (a.error ? -1 : a.sharpeRatio),
  );

  const col = (s: string | number, w: number) => String(s).padStart(w);

  console.log(
    `${"Variant".padEnd(26)} ${"Sharpe".padStart(7)} ${"CAGR%".padStart(7)} ${"MaxDD%".padStart(7)} ${"WinRate%".padStart(9)} ${"Trades".padStart(7)}`,
  );
  console.log("─".repeat(67));

  for (const r of sorted) {
    if (r.error) {
      console.log(`${r.label.padEnd(26)} FAILED — ${r.error.slice(0, 40)}`);
    } else {
      console.log(
        `${r.label.padEnd(26)}` +
        `${col(r.sharpeRatio.toFixed(3), 7)} ` +
        `${col((r.cagr * 100).toFixed(1), 7)} ` +
        `${col((r.maxDrawdown * 100).toFixed(1), 7)} ` +
        `${col((r.winRate * 100).toFixed(1), 9)} ` +
        `${col(r.totalTrades, 7)}`,
      );
    }
  }

  console.log("\n──── Trade log (autonomous variants only) ────");
  for (const r of results) {
    if (r.trades_detail.length > 0) {
      console.log(`\n${r.label}:`);
      r.trades_detail.forEach((t) => console.log(`  ${t}`));
    }
  }

  const winner = sorted.find((r) => !r.error);
  if (winner) {
    console.log(`\n🏆  Winner (by Sharpe): ${winner.label}`);
    console.log(`    Sharpe=${winner.sharpeRatio.toFixed(4)} | CAGR=${(winner.cagr * 100).toFixed(2)}% | MaxDD=${(winner.maxDrawdown * 100).toFixed(2)}%`);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
