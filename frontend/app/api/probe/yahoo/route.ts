/**
 * Deployed probe for sprint 007-SPIKE-YAHOO-FINANCE2-PROBE.
 *
 * GET /api/probe/yahoo?tickers=AAPL,MSFT&parallel=1
 *
 * Verifies that yahoo-finance2 works inside the Vercel serverless runtime —
 * some unofficial Yahoo APIs trip on cookie/CSRF handling in specific
 * environments. This endpoint proves or disproves Vercel compatibility and
 * exercises Yahoo's rate-limit against the Vercel IP pool.
 *
 * Public route — no auth. Temporary, deleted when the spike is complete.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  INFO_KEYS,
  latencyStats,
  probeMany,
  summarizeCoverage,
} from "@/lib/probe-yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_TICKERS = ["AAPL", "MSFT", "TSLA", "NVDA", "META"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tickersParam = url.searchParams.get("tickers");
  const parallel = url.searchParams.get("parallel") === "1";
  const tickers = tickersParam
    ? tickersParam.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_TICKERS;

  if (tickers.length === 0 || tickers.length > 30) {
    return NextResponse.json(
      { error: "tickers must be 1–30 comma-separated symbols" },
      { status: 400 },
    );
  }

  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const results = await probeMany(tickers, parallel);
  const totalMs = Math.round(performance.now() - t0);

  const coverage = summarizeCoverage(results);
  const stats = latencyStats(results.map((r) => r.latency_ms));
  const success = results.filter((r) => r.ok).length;

  return NextResponse.json(
    {
      probe: "yahoo-finance2",
      info_keys: INFO_KEYS,
      tickers,
      parallel,
      success_count: success,
      total_count: results.length,
      total_wall_clock_ms: totalMs,
      latency: stats,
      coverage,
      results,
      runtime: process.version,
      started_at: startedAt,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
