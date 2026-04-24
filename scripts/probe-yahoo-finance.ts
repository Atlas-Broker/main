/**
 * Local probe for sprint 007-SPIKE-YAHOO-FINANCE2-PROBE.
 *
 * Runs yahoo-finance2 against Atlas's standard ticker set (AAPL, MSFT, TSLA,
 * NVDA, META) and reports coverage, latency, and output stability.
 *
 * Usage:
 *   cd frontend
 *   npx tsx scripts/probe-yahoo-finance.ts
 *   npx tsx scripts/probe-yahoo-finance.ts --parallel 20
 *   npx tsx scripts/probe-yahoo-finance.ts --stability 2 --delay 30
 */
import {
  INFO_KEYS,
  latencyStats,
  probeMany,
  probeTicker,
  summarizeCoverage,
} from "../lib/probe-yahoo";

const DEFAULT_TICKERS = ["AAPL", "MSFT", "TSLA", "NVDA", "META"];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function checkmark(r: { ok: boolean; missing: string[]; nullable: string[] }) {
  if (r.ok) return "OK";
  if (r.missing.length === 0) return "null-only";
  return `missing=${r.missing.length}`;
}

async function main() {
  const parallelCount = Number(arg("--parallel", "0"));
  const stabilityRuns = Number(arg("--stability", "0"));
  const stabilityDelay = Number(arg("--delay", "30"));
  const tickers = parallelCount
    ? generateTickers(parallelCount)
    : DEFAULT_TICKERS;

  console.log(`=== yahoo-finance2 probe ===`);
  console.log(`tickers: ${tickers.join(", ")}`);

  // 1. Cold + warm latency on 5 tickers sequentially
  if (!parallelCount && !stabilityRuns) {
    console.log(`\n--- cold run (sequential) ---`);
    const cold = await probeMany(tickers, false);
    printRun(cold);

    console.log(`\n--- warm run (sequential, same process) ---`);
    const warm = await probeMany(tickers, false);
    printRun(warm);

    printCoverage([...cold, ...warm]);
    return;
  }

  // 2. Parallel rate-limit test
  if (parallelCount) {
    console.log(`\n--- parallel burst (${tickers.length} tickers) ---`);
    const t0 = performance.now();
    const results = await probeMany(tickers, true);
    const totalMs = Math.round(performance.now() - t0);
    printRun(results);
    console.log(`total wall-clock: ${totalMs}ms  success: ${results.filter(r => r.ok).length}/${results.length}`);
    const errs = results.filter(r => r.error).map(r => `${r.ticker}: ${r.error}`);
    if (errs.length) console.log(`errors:\n${errs.join("\n")}`);
    return;
  }

  // 3. Stability — N runs, M seconds apart
  if (stabilityRuns) {
    const runs: (Awaited<ReturnType<typeof probeMany>>)[] = [];
    for (let i = 0; i < stabilityRuns; i++) {
      console.log(`\n--- stability run ${i + 1}/${stabilityRuns} ---`);
      const r = await probeMany(tickers, false);
      printRun(r);
      runs.push(r);
      if (i < stabilityRuns - 1) {
        console.log(`sleeping ${stabilityDelay}s...`);
        await new Promise((res) => setTimeout(res, stabilityDelay * 1000));
      }
    }
    printStabilityDiff(runs);
  }
}

function printRun(results: Awaited<ReturnType<typeof probeMany>>) {
  for (const r of results) {
    console.log(
      `  ${r.ticker.padEnd(6)} ${String(r.latency_ms).padStart(5)}ms  ${checkmark(r)}${r.missing.length ? "  missing=" + r.missing.join(",") : ""}${r.error ? "  err=" + r.error : ""}`,
    );
  }
  const lats = results.map((r) => r.latency_ms);
  const stats = latencyStats(lats);
  console.log(
    `  p50=${stats.p50}ms p95=${stats.p95}ms p99=${stats.p99}ms min=${stats.min}ms max=${stats.max}ms mean=${stats.mean}ms`,
  );
}

function printCoverage(results: Awaited<ReturnType<typeof probeMany>>) {
  const cov = summarizeCoverage(results);
  console.log(`\n--- coverage (out of ${results.length} probes) ---`);
  for (const key of INFO_KEYS) {
    const c = cov[key];
    const mark = c.missing === 0 ? "OK" : c.missing === results.length ? "FAIL" : "partial";
    console.log(
      `  ${key.padEnd(22)} ${mark.padEnd(8)} ok=${c.ok} null=${c.null} missing=${c.missing}`,
    );
  }
}

function printStabilityDiff(runs: Awaited<ReturnType<typeof probeMany>>[]) {
  if (runs.length < 2) return;
  const keys = INFO_KEYS;
  const tickers = runs[0].map((r) => r.ticker);
  console.log(`\n--- stability diff (run ${runs.length} vs run 1) ---`);
  const changed: Record<string, Set<string>> = {};
  for (const t of tickers) {
    const first = runs[0].find((r) => r.ticker === t);
    const last = runs[runs.length - 1].find((r) => r.ticker === t);
    if (!first || !last) continue;
    for (const k of keys) {
      const a = first.info[k];
      const b = last.info[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        if (!changed[k]) changed[k] = new Set();
        changed[k].add(t);
      }
    }
  }
  for (const k of keys) {
    if (changed[k]) {
      console.log(`  ${k.padEnd(22)} changed on: ${[...changed[k]].join(", ")}`);
    }
  }
  const unchangedKeys = keys.filter((k) => !changed[k]);
  console.log(`  ${unchangedKeys.length}/${keys.length} fields unchanged across ${runs.length} runs`);
}

function generateTickers(n: number): string[] {
  const base = [
    "AAPL","MSFT","TSLA","NVDA","META","GOOGL","AMZN","NFLX","AMD","INTC",
    "JPM","BAC","GS","V","MA","WMT","HD","COST","PG","KO",
    "PFE","JNJ","UNH","XOM","CVX","BA","CAT","GE","DIS","NKE",
  ];
  return base.slice(0, n);
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
