/**
 * Phase A — Philosophy Axis Experiment CLI runner.
 *
 * 4 philosophies × 2 circuit-breaker states × 1 model × 1 period = 8 cells.
 * Results written to MongoDB atlas.experiment_results.
 *
 * Usage:
 *   npm run experiment:philosophy -- --dry-run   # validate matrix, print cost, exit
 *   npm run experiment:philosophy                 # full run (~$0.88, hard ceiling $20)
 */

import {
  buildPhaseAMatrix,
  runPhaseA,
  writeExperimentSummary,
  PHASE_A,
} from "../lib/experiment/philosophy-axis";
import type { ExperimentCell, CellResult } from "../lib/experiment/philosophy-axis";

const isDryRun = process.argv.includes("--dry-run");

// Real user ID with broker_connections in Supabase — required for Alpaca market data.
const EXPERIMENT_USER_ID = "user_3B4k96FjK9wZUDi8Xs0AzeNLnvy";

// ─── Dry-run ──────────────────────────────────────────────────────────────────

function printDryRun() {
  const cells = buildPhaseAMatrix();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    Atlas — Philosophy Axis Experiment  (Phase A)  DRY   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Tickers  : ${PHASE_A.tickers.join(", ")}`);
  console.log(`Period   : ${PHASE_A.startDate} → ${PHASE_A.endDate}`);
  console.log(`Model    : ${PHASE_A.llmConfig.model} (${PHASE_A.llmConfig.provider})`);
  console.log(`Capital  : $${PHASE_A.initialCapital.toLocaleString()}`);
  console.log(`Est. cost: ~$${PHASE_A.estimatedCostUsd.toFixed(2)}  (hard ceiling $20)\n`);

  console.log("Matrix (8 cells):");
  const col = (s: string, w: number) => s.padEnd(w);
  console.log(`  ${"ID".padEnd(20)} ${"Philosophy".padEnd(12)} CB`);
  console.log("  " + "─".repeat(38));
  for (const cell of cells) {
    console.log(
      `  ${col(cell.id, 20)} ${col(cell.philosophy, 12)} ${cell.circuitBreakerEnabled ? "ON" : "OFF"}`,
    );
  }

  console.log("\nRuntime estimate: ~45–90 min on fast network (65 days × 5 tickers × 8 cells)");
  console.log("\n[DRY RUN] No API calls made. Pass without --dry-run to execute.");
}

// ─── Progress formatters ──────────────────────────────────────────────────────

function onCellStart(cell: ExperimentCell, index: number, total: number) {
  console.log(`\n[${index + 1}/${total}] Starting cell: ${cell.id}`);
}

function onCellDone(result: CellResult, index: number, total: number) {
  const { metrics, error, durationMs } = result;
  const mins = (durationMs / 60_000).toFixed(1);
  if (error) {
    console.log(`  ✗ FAILED in ${mins}m — ${error.slice(0, 80)}`);
  } else {
    console.log(
      `  ✓ Done in ${mins}m — ` +
      `Sharpe=${metrics.sharpeRatio.toFixed(3)} | ` +
      `CAGR=${(metrics.cagr * 100).toFixed(1)}% | ` +
      `MaxDD=${(metrics.maxDrawdown * 100).toFixed(1)}%`,
    );
  }
}

let lastProgressLine = "";
function onProgress(date: string, ticker: string, step: number, total: number) {
  const pct = ((step / total) * 100).toFixed(0);
  const line = `  ${date} ${ticker.padEnd(5)} [${step}/${total}] ${pct}%`;
  if (line !== lastProgressLine) {
    process.stdout.write(`\r${line}  `);
    lastProgressLine = line;
  }
}

// ─── Results printer ──────────────────────────────────────────────────────────

function printResults(summary: Awaited<ReturnType<typeof runPhaseA>>) {
  if (!summary) return;

  const { cellResults, pairs, h1, h2, avgDrawdownDeltaPct, phase_recommendation } = summary;

  console.log("\n\n══════════════════════ PHASE A RESULTS ══════════════════════\n");

  // Per-cell table
  const col = (s: string | number, w: number) => String(s).padStart(w);
  console.log(
    `${"Cell".padEnd(22)} ${"Sharpe".padStart(7)} ${"CAGR%".padStart(7)} ${"MaxDD%".padStart(7)} ${"WinRate%".padStart(9)} ${"Trades".padStart(7)} ${"Status".padStart(8)}`,
  );
  console.log("─".repeat(73));

  for (const r of cellResults) {
    const { metrics, error } = r;
    if (error) {
      console.log(`${r.cell.id.padEnd(22)} FAILED — ${error.slice(0, 45)}`);
    } else {
      console.log(
        `${r.cell.id.padEnd(22)}` +
        `${col(metrics.sharpeRatio.toFixed(3), 7)} ` +
        `${col((metrics.cagr * 100).toFixed(1), 7)} ` +
        `${col((metrics.maxDrawdown * 100).toFixed(1), 7)} ` +
        `${col((metrics.winRate * 100).toFixed(1), 9)} ` +
        `${col(metrics.totalTrades, 7)}` +
        `${col("ok", 8)}`,
      );
    }
  }

  // Philosophy pairs
  console.log("\n──── Circuit-breaker effect per philosophy ────");
  console.log(`${"Philosophy".padEnd(12)} ${"DD w/o CB".padStart(10)} ${"DD w/ CB".padStart(10)} ${"DD delta%".padStart(10)} ${"Ret delta%".padStart(11)}`);
  console.log("─".repeat(57));

  for (const p of pairs) {
    console.log(
      `${p.philosophy.padEnd(12)}` +
      `${String((p.cbOff.maxDrawdown * 100).toFixed(1) + "%").padStart(10)} ` +
      `${String((p.cbOn.maxDrawdown * 100).toFixed(1) + "%").padStart(10)} ` +
      `${String(p.drawdownDeltaPct.toFixed(1) + "%").padStart(10)} ` +
      `${String((p.returnDelta * 100).toFixed(1) + "%").padStart(11)}`,
    );
  }

  console.log(`\n  Avg drawdown delta: ${avgDrawdownDeltaPct.toFixed(1)}%`);

  // Hypotheses
  console.log("\n──── Hypotheses ────");
  console.log(`H1 [CB reduces drawdown ≥20%]: ${h1.verdict.toUpperCase()}`);
  console.log(`  ${h1.evidence}`);
  console.log(`\nH2 [Effect consistent across philosophies]: ${h2.verdict.toUpperCase()}`);
  console.log(`  ${h2.evidence}`);

  // Recommendation
  console.log("\n──── Phase recommendation ────");
  if (phase_recommendation === "upgrade_to_phase_b") {
    console.log("  => UPGRADE TO PHASE B (H1 ambiguous — need larger model for clarity)");
  } else {
    console.log(`  => STOP PHASE A (H1 ${h1.verdict} — clear signal at this model size)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (isDryRun) {
    printDryRun();
    process.exit(0);
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    Atlas — Philosophy Axis Experiment  (Phase A)         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Tickers: ${PHASE_A.tickers.join(", ")}  |  ${PHASE_A.startDate} → ${PHASE_A.endDate}`);
  console.log(`Model  : ${PHASE_A.llmConfig.model}  |  Est. cost ~$${PHASE_A.estimatedCostUsd.toFixed(2)}\n`);

  const summary = await runPhaseA({
    onCellStart,
    onCellDone,
    onProgress,
    hardCeilingUsd: 20,
    userId: EXPERIMENT_USER_ID,
  });

  if (!summary) {
    console.error("runPhaseA returned null (unexpected in non-dry-run mode)");
    process.exit(1);
  }

  printResults(summary);

  process.stdout.write("\nWriting experiment summary to MongoDB...");
  const docId = await writeExperimentSummary(summary);
  console.log(` done.\n  Document ID: ${docId}`);

  console.log(`\n  phase_recommendation: ${summary.phase_recommendation}`);
  console.log("\nExperiment complete.");
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
