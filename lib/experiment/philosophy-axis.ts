/**
 * Philosophy Axis Experiment — Phase A runner.
 *
 * 4 philosophies × 2 circuit-breaker states × 1 model × 1 period = 8 cells.
 * Produces an experiment_summary document in MongoDB with H1/H2 verdicts
 * and a phase_recommendation for Claude Chat.
 *
 * Sprint 036.
 */

import { MongoClient } from "mongodb";
import { runGraph } from "../agents";
import { generateDateRange } from "../backtest/runner";
import { VirtualPortfolio } from "../backtest/simulator";
import { computeMetrics } from "../backtest/metrics";
import { computeNextState, gateFromState } from "../boundary/circuit-breaker";
import type { EbcRecord, EbcState } from "../boundary/circuit-breaker";
import type { AtlasState } from "../agents/state";
import type { BacktestMetrics, BacktestSlice } from "../backtest/types";
import type { LLMConfig } from "../agents/llm";

// ─── Phase A constants ────────────────────────────────────────────────────────

export const PHASE_A = {
  tickers: ["AAPL", "MSFT", "NVDA", "TSLA", "META"] as const,
  startDate: "2024-08-01",
  endDate: "2024-10-31",
  llmConfig: { provider: "groq", model: "llama-3.1-8b-instant" } as LLMConfig,
  initialCapital: 10_000,
  // Cost estimate: ~5600 tokens/run × 65 days × 5 tickers × 8 cells = ~14.6M tokens
  // Groq llama-3.1-8b-instant: $0.06/M tokens → ~$0.88 total (well under $4 budget)
  estimatedCostUsd: 0.88,
} as const;

export type Philosophy = "buffett" | "soros" | "lynch" | "balanced";
const PHILOSOPHIES: Philosophy[] = ["buffett", "soros", "lynch", "balanced"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExperimentCell {
  id: string;  // e.g. "buffett-cb-on"
  philosophy: Philosophy;
  circuitBreakerEnabled: boolean;
  llmConfig: LLMConfig;
}

export interface CellResult {
  cell: ExperimentCell;
  metrics: BacktestMetrics;
  completedAt: string;
  durationMs: number;
  error?: string;
}

export interface PhilosophyPair {
  philosophy: Philosophy;
  cbOff: BacktestMetrics;
  cbOn: BacktestMetrics;
  /** positive = CB reduced drawdown; negative = CB increased drawdown */
  drawdownDeltaPct: number;
  /** positive = CB improved returns */
  returnDelta: number;
}

export interface HypothesisResult {
  verdict: "supported" | "refuted" | "ambiguous";
  evidence: string;
}

export interface ExperimentSummary {
  phase: "A";
  llmModel: string;
  startDate: string;
  endDate: string;
  tickers: string[];
  cellResults: CellResult[];
  pairs: PhilosophyPair[];
  h1: HypothesisResult;
  h2: HypothesisResult;
  /** Average drawdown reduction across all 4 pairs (positive = CB helps) */
  avgDrawdownDeltaPct: number;
  phase_recommendation: "stop_phase_a" | "upgrade_to_phase_b";
  writtenAt: string;
}

// ─── Matrix builder ───────────────────────────────────────────────────────────

export function buildPhaseAMatrix(): ExperimentCell[] {
  const cells: ExperimentCell[] = [];
  for (const philosophy of PHILOSOPHIES) {
    for (const cbEnabled of [false, true]) {
      cells.push({
        id: `${philosophy}-cb-${cbEnabled ? "on" : "off"}`,
        philosophy,
        circuitBreakerEnabled: cbEnabled,
        llmConfig: PHASE_A.llmConfig,
      });
    }
  }
  return cells; // 8 cells
}

// ─── Cell runner ──────────────────────────────────────────────────────────────

export async function runCell(
  cell: ExperimentCell,
  opts: {
    onProgress?: (date: string, ticker: string, step: number, total: number) => void;
    userId?: string;
  } = {},
): Promise<CellResult> {
  const t0 = Date.now();
  const { onProgress, userId = "experiment-phase-a" } = opts;

  try {
    const dates = generateDateRange(PHASE_A.startDate, PHASE_A.endDate);
    const tickers = [...PHASE_A.tickers];
    const total = dates.length * tickers.length;
    let step = 0;

    const rawSlices: BacktestSlice[] = [];

    for (const date of dates) {
      for (const ticker of tickers) {
        step++;
        onProgress?.(date, ticker, step, total);

        let state: AtlasState;
        try {
          state = await runGraph(ticker, {
            userId,
            mode: "advisory",
            philosophy: cell.philosophy,
            isBacktest: true,
            asOfDate: date,
            llmConfig: cell.llmConfig,
          });
        } catch {
          // Transient LLM parse / validation error — push a no-op HOLD slice and continue.
          state = {
            ticker,
            user_id: userId ?? "experiment-phase-a",
            as_of_date: date,
            portfolio_decision: { action: "HOLD", confidence: 0, rationale: "step-error" },
          } as unknown as AtlasState;
        }

        rawSlices.push({
          jobId: cell.id,
          date,
          ticker,
          decision: state,
          completedAt: new Date().toISOString(),
        });
      }
    }

    // ── Simulation pass (mirrors lib/backtest/runner.ts) ───────────────────
    const portfolio = new VirtualPortfolio(PHASE_A.initialCapital);
    const lastDate = dates[dates.length - 1];

    let cbRecord: EbcRecord = {
      state: "green" as EbcState,
      consecutiveLosses: 0,
      recoveryWins: 0,
      stateChangedAt: new Date(PHASE_A.startDate + "T00:00:00Z"),
    };

    const simulatedSlices: BacktestSlice[] = rawSlices.map((slice) => {
      const agentState = slice.decision as AtlasState;
      const decision = agentState.portfolio_decision;
      const currentPrice = agentState.current_price ?? null;
      const isLastDay = slice.date === lastDate;

      const cbGate = cell.circuitBreakerEnabled ? gateFromState(cbRecord.state) : null;

      const tradeResult = portfolio.process({
        date: slice.date,
        ticker: slice.ticker,
        action: cbGate && !cbGate.canExecute ? "HOLD" : (decision?.action ?? "HOLD"),
        confidence: decision?.confidence ?? 0,
        ebcMode: "autonomous",
        executionPrice: currentPrice,
        isLastDay,
        confidenceThresholdOverride: cbGate?.confidenceGate ?? null,
        positionValueOverride:
          cbGate ? (cbGate.canExecute ? 1000 * cbGate.notionalMultiplier : 0) : null,
      });

      if (cell.circuitBreakerEnabled && tradeResult.executed) {
        const outcome: "win" | "loss" =
          (tradeResult.pnl ?? 0) > 0 ? "win" : "loss";
        cbRecord = computeNextState(cbRecord, outcome);
      }

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
          ebc_state: cbRecord.state,
        },
      };
    });

    const metrics = computeMetrics(simulatedSlices, PHASE_A.initialCapital);

    return {
      cell,
      metrics,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      cell,
      metrics: emptyMetrics(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export function analyzeResults(cellResults: CellResult[]): {
  pairs: PhilosophyPair[];
  h1: HypothesisResult;
  h2: HypothesisResult;
  avgDrawdownDeltaPct: number;
  phase_recommendation: "stop_phase_a" | "upgrade_to_phase_b";
} {
  const pairs: PhilosophyPair[] = [];

  for (const philosophy of PHILOSOPHIES) {
    const cbOff = cellResults.find(
      (r) => r.cell.philosophy === philosophy && !r.cell.circuitBreakerEnabled && !r.error,
    );
    const cbOn = cellResults.find(
      (r) => r.cell.philosophy === philosophy && r.cell.circuitBreakerEnabled && !r.error,
    );

    if (!cbOff || !cbOn) continue;

    // Positive drawdownDeltaPct = CB reduced drawdown (good)
    const ddOff = cbOff.metrics.maxDrawdown;
    const ddOn = cbOn.metrics.maxDrawdown;
    const drawdownDeltaPct =
      ddOff > 0 ? ((ddOff - ddOn) / ddOff) * 100 : 0;

    const returnDelta = cbOn.metrics.totalReturn - cbOff.metrics.totalReturn;

    pairs.push({ philosophy, cbOff: cbOff.metrics, cbOn: cbOn.metrics, drawdownDeltaPct, returnDelta });
  }

  const avgDrawdownDeltaPct =
    pairs.length > 0
      ? pairs.reduce((s, p) => s + p.drawdownDeltaPct, 0) / pairs.length
      : 0;

  // ── H1: avg drawdown reduction ≥20%, return cost ≤10% ──────────────────────
  const avgReturnDelta =
    pairs.length > 0
      ? pairs.reduce((s, p) => s + p.returnDelta, 0) / pairs.length
      : 0;

  let h1Verdict: HypothesisResult["verdict"];
  let h1Evidence: string;

  if (avgDrawdownDeltaPct >= 20 && avgReturnDelta >= -0.10) {
    h1Verdict = "supported";
    h1Evidence = `Avg drawdown reduction ${avgDrawdownDeltaPct.toFixed(1)}% (≥20% threshold) with return delta ${(avgReturnDelta * 100).toFixed(1)}% (within -10% tolerance).`;
  } else if (avgDrawdownDeltaPct <= 5) {
    h1Verdict = "refuted";
    h1Evidence = `Avg drawdown reduction only ${avgDrawdownDeltaPct.toFixed(1)}% (≤5% null threshold). CB has negligible effect at this model size.`;
  } else {
    h1Verdict = "ambiguous";
    h1Evidence = `Avg drawdown reduction ${avgDrawdownDeltaPct.toFixed(1)}% falls in ambiguous 5%–20% band. Phase B required for clarity.`;
  }

  // ── H2: effect consistent across all philosophies ──────────────────────────
  const allPositive = pairs.every((p) => p.drawdownDeltaPct > 0);
  const allNegative = pairs.every((p) => p.drawdownDeltaPct < 0);
  const perPhilosophy = pairs
    .map((p) => `${p.philosophy}: ${p.drawdownDeltaPct.toFixed(1)}%`)
    .join(", ");

  let h2Verdict: HypothesisResult["verdict"];
  let h2Evidence: string;

  if (allPositive) {
    h2Verdict = "supported";
    h2Evidence = `CB reduced drawdown across all ${pairs.length} philosophies. Per-philosophy: ${perPhilosophy}.`;
  } else if (allNegative) {
    h2Verdict = "refuted";
    h2Evidence = `CB increased drawdown across all ${pairs.length} philosophies — consistent null result. Per-philosophy: ${perPhilosophy}.`;
  } else {
    h2Verdict = "ambiguous";
    h2Evidence = `Mixed effect across philosophies. Per-philosophy: ${perPhilosophy}.`;
  }

  // ── Phase recommendation ───────────────────────────────────────────────────
  const phase_recommendation: "stop_phase_a" | "upgrade_to_phase_b" =
    h1Verdict === "ambiguous" ? "upgrade_to_phase_b" : "stop_phase_a";

  return {
    pairs,
    h1: { verdict: h1Verdict, evidence: h1Evidence },
    h2: { verdict: h2Verdict, evidence: h2Evidence },
    avgDrawdownDeltaPct,
    phase_recommendation,
  };
}

// ─── MongoDB writer ───────────────────────────────────────────────────────────

export async function writeExperimentSummary(
  summary: ExperimentSummary,
): Promise<string> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not set");

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const col = client.db("atlas").collection("experiment_results");
    const result = await col.insertOne(summary);
    return result.insertedId.toHexString();
  } finally {
    await client.close();
  }
}

// ─── Top-level orchestrator ───────────────────────────────────────────────────

export async function runPhaseA(opts: {
  dryRun?: boolean;
  onCellStart?: (cell: ExperimentCell, index: number, total: number) => void;
  onCellDone?: (result: CellResult, index: number, total: number) => void;
  onProgress?: (date: string, ticker: string, step: number, total: number) => void;
  hardCeilingUsd?: number;
  userId?: string;
}): Promise<ExperimentSummary | null> {
  const { dryRun = false, hardCeilingUsd = 20, userId } = opts;

  const cells = buildPhaseAMatrix();
  const estimatedCost = PHASE_A.estimatedCostUsd;

  if (estimatedCost > hardCeilingUsd) {
    throw new Error(
      `Cost estimate $${estimatedCost.toFixed(2)} exceeds hard ceiling $${hardCeilingUsd.toFixed(2)}. Aborting.`,
    );
  }

  if (dryRun) return null;

  const cellResults: CellResult[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    opts.onCellStart?.(cell, i, cells.length);

    const result = await runCell(cell, { onProgress: opts.onProgress, userId });
    cellResults.push(result);

    opts.onCellDone?.(result, i, cells.length);

    if (cellResults.filter((r) => r.error).length > 4) {
      throw new Error("Too many cell failures (>4). Aborting experiment.");
    }
  }

  const analysis = analyzeResults(cellResults);

  const summary: ExperimentSummary = {
    phase: "A",
    llmModel: PHASE_A.llmConfig.model,
    startDate: PHASE_A.startDate,
    endDate: PHASE_A.endDate,
    tickers: [...PHASE_A.tickers],
    cellResults,
    ...analysis,
    writtenAt: new Date().toISOString(),
  };

  return summary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyMetrics(): BacktestMetrics {
  return { cagr: 0, sharpeRatio: 0, maxDrawdown: 0, calmarRatio: 0, profitFactor: 0, winRate: 0, totalTrades: 0, totalReturn: 0 };
}
