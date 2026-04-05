"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";
import { EquityChart } from "@/app/admin/_components/EquityChart";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type BacktestJob = {
  id: string;
  status: JobStatus;
  tickers: string[];
  start_date: string;
  end_date: string;
  ebc_mode: string;
  philosophy_mode?: string | null;
  confidence_threshold?: number | null;
  initial_capital?: number | null;
  experiment_id?: string | null;
  progress: number;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  total_trades: number | null;
  signal_to_execution_rate: number | null;
  directional_accuracy?: number | null;
  created_at: string;
  completed_at: string | null;
  error_message?: string | null;
  mongo_id?: string | null;
  results?: {
    daily_runs: DailyRun[];
    equity_curve: { date: string; value: number; cash: number }[];
    metrics: Record<string, unknown>;
  };
};

type DailyRun = {
  date: string;
  ticker: string;
  action: string;
  confidence: number | null;
  reasoning?: string;
  executed: boolean;
  simulated_price: number | null;
  shares?: number | null;
  pnl: number | null;
  skipped_reason: string | null;
  trace_id: string | null;
  error?: string;
  portfolio_value_after?: number | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_MS = 2 * 60 * 60 * 1000;

const philosophyColors: Record<string, string> = {
  lynch:    "#6366f1",
  soros:    "#f59e0b",
  buffett:  "#10b981",
  balanced: "#3b82f6",
};

const statusColor: Record<JobStatus, string> = {
  queued:    "var(--dim)",
  running:   "var(--hold)",
  completed: "var(--bull)",
  failed:    "var(--bear)",
  cancelled: "var(--dim)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, dec = 2) =>
  n == null || isNaN(n as number) ? "—" : (n as number).toFixed(dec);

const pct = (n: number | null | undefined) =>
  n == null || isNaN(n as number) ? "—" : `${((n as number) * 100).toFixed(2)}%`;

const conf = (n: number | null | undefined) =>
  n == null || isNaN(n as number) ? "—" : `${Math.round((n as number) * 100)}%`;

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function jobLabel(job: BacktestJob): string {
  const parts: string[] = [];
  if (job.philosophy_mode) parts.push(job.philosophy_mode.charAt(0).toUpperCase() + job.philosophy_mode.slice(1));
  if (job.confidence_threshold != null) parts.push(`${(job.confidence_threshold * 100).toFixed(0)}% threshold`);
  return parts.join(" · ") || job.id.slice(0, 8);
}

function jobAccent(job: BacktestJob): string {
  if (job.philosophy_mode) return philosophyColors[job.philosophy_mode] ?? "#3b82f6";
  return "#3b82f6";
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
@keyframes jd-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes jd-pulse {
  0%   { opacity: 0.7; transform: scale(1); }
  70%  { opacity: 0;   transform: scale(2.2); }
  100% { opacity: 0;   transform: scale(2.2); }
}
@keyframes jd-fade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.jd-fade { animation: jd-fade 0.2s ease both; }
.jd-shimmer {
  background: linear-gradient(90deg, var(--hold) 0%, #f5c542 40%, var(--hold) 100%);
  background-size: 200% 100%;
  animation: jd-shimmer 1.8s linear infinite;
}
`;

function StyleInjector() {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return; ref.current = true;
    const el = document.createElement("style");
    el.textContent = PAGE_STYLES;
    document.head.appendChild(el);
  }, []);
  return null;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function PulsingDot({ color = "var(--hold)" }: { color?: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: color, opacity: 0.4, animation: "jd-pulse 1.4s ease-out infinite" }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, position: "relative" }} />
    </span>
  );
}

function ProgressBar({ progress, running }: { progress: number; running: boolean }) {
  return (
    <div style={{ background: "var(--elevated)", borderRadius: 6, height: 6, overflow: "hidden" }}>
      <div
        className={running ? "jd-shimmer" : ""}
        style={{ width: `${Math.max(progress, running ? 2 : 0)}%`, height: "100%", borderRadius: 6, background: running ? undefined : "var(--bull)", transition: "width 0.6s ease" }}
      />
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const [color, bg] =
    action === "BUY"   ? ["var(--bull)", "var(--bull-bg)"] :
    action === "SELL"  ? ["var(--bear)", "var(--bear-bg)"] :
    action === "ERROR" ? ["var(--bear)", "var(--bear-bg)"] :
    ["var(--hold)", "var(--hold-bg)"];
  return (
    <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, color, background: bg, flexShrink: 0 }}>
      {action}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [job, setJob]       = useState<BacktestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming]     = useState(false);

  const load = useCallback(async () => {
    const res = await fetchWithAuth(`${API}/v1/backtest/${id}`);
    if (!res?.ok) { setError("Job not found."); return; }
    setJob(await res.json());
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Poll every 5s while active
  useEffect(() => {
    if (!job) return;
    if (job.status !== "running" && job.status !== "queued") return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [job, load]);

  async function handleCancel() {
    setCancelling(true);
    await fetchWithAuth(`${API}/v1/backtest/${id}/cancel`, { method: "POST" });
    await load();
    setCancelling(false);
  }

  async function handleResume() {
    setResuming(true);
    await fetchWithAuth(`${API}/v1/backtest/${id}/resume`, { method: "POST" });
    await load();
    setResuming(false);
  }

  function exportCSV() {
    if (!job?.results?.daily_runs) return;
    const runs = job.results.daily_runs;
    const header = "date,ticker,action,confidence,executed,price,pnl,reason\n";
    const rows = runs.map((r) =>
      [r.date, r.ticker, r.action, r.confidence ?? "", r.executed, r.simulated_price ?? "", r.pnl ?? "",
       `"${(r.skipped_reason ?? r.reasoning ?? "").replace(/"/g, "'")}"`].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `job-${id.slice(0, 8)}-runs.csv`;
    a.click();
  }

  const backPath = job?.experiment_id
    ? `/admin/experiments/${job.experiment_id}`
    : "/admin/backtesting";

  const isActive = job?.status === "running" || job?.status === "queued";
  const isStale  = isActive && job ? Date.now() - new Date(job.created_at).getTime() > STALE_MS : false;
  const accent   = job ? jobAccent(job) : "var(--brand)";
  const runs     = job?.results?.daily_runs ?? [];
  const executed = runs.filter((r) => r.executed).length;
  const errors   = runs.filter((r) => r.action === "ERROR").length;

  return (
    <>
      <StyleInjector />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Back nav */}
        <button
          onClick={() => router.push(backPath)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontFamily: "var(--font-jb)", fontSize: 11, padding: 0, alignSelf: "flex-start" }}
        >
          ← {job?.experiment_id ? "Back to Experiment" : "Back to Backtesting"}
        </button>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ghost)", fontFamily: "var(--font-nunito)" }}>Loading job…</div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--bear)", fontFamily: "var(--font-nunito)" }}>{error}</div>
        )}

        {!loading && job && (
          <div className="jd-fade" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Header card */}
            <div style={{ background: "var(--surface)", border: `1px solid var(--line)`, borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 18, color: accent }}>
                      {jobLabel(job)}
                    </span>
                    <span style={{
                      fontSize: 9, fontFamily: "var(--font-jb)",
                      color: isStale ? "var(--bear)" : statusColor[job.status],
                      padding: "2px 8px", borderRadius: 3,
                      background: `${isStale ? "var(--bear)" : statusColor[job.status]}15`,
                      border: `1px solid ${isStale ? "var(--bear)" : statusColor[job.status]}30`,
                      textTransform: "uppercase",
                    }}>
                      {isStale ? "stale" : job.status}
                    </span>
                    {isActive && !isStale && <PulsingDot />}
                  </div>
                  <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
                    {job.tickers.join(" · ")} · {job.start_date} → {job.end_date} · {job.ebc_mode} · {relTime(job.created_at)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  {(isActive || isStale) && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      style={{ fontSize: 11, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--bear)40", color: "var(--bear)", padding: "6px 14px", borderRadius: 6, cursor: "pointer" }}
                    >
                      {cancelling ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                  {(job.status === "failed" || job.status === "cancelled") && job.mongo_id && (
                    <button
                      onClick={handleResume}
                      disabled={resuming}
                      style={{ fontSize: 11, fontFamily: "var(--font-jb)", background: "var(--brand)12", border: "1px solid var(--brand)40", color: "var(--brand)", padding: "6px 14px", borderRadius: 6, cursor: "pointer" }}
                    >
                      {resuming ? "Resuming…" : "Resume"}
                    </button>
                  )}
                  <button
                    onClick={load}
                    style={{ fontSize: 11, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--line)", color: "var(--ghost)", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
                  >
                    ↺
                  </button>
                </div>
              </div>

              {/* Progress */}
              {isActive && (
                <div style={{ marginTop: 16 }}>
                  <ProgressBar progress={job.progress} running={job.status === "running"} />
                  <div style={{ marginTop: 6, fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
                    {job.progress}% complete · {job.status === "queued" ? "queued, waiting to start" : "processing…"}
                  </div>
                </div>
              )}

              {/* Error */}
              {job.status === "failed" && job.error_message && (
                <div style={{ marginTop: 14, fontSize: 12, color: "var(--bear)", background: "var(--bear-bg)", borderRadius: 6, padding: "10px 14px" }}>
                  {job.error_message}
                </div>
              )}

              {/* Metrics grid */}
              {job.status === "completed" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 20 }}>
                  {[
                    { k: "Cum. Return",    v: pct(job.total_return),              color: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" },
                    { k: "Sharpe",         v: fmt(job.sharpe_ratio),              color: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--dim)" },
                    { k: "Max Drawdown",   v: pct(job.max_drawdown),              color: "var(--bear)" },
                    { k: "Win Rate",       v: pct(job.win_rate),                  color: "var(--dim)" },
                    { k: "Trades",         v: job.total_trades ?? "—",            color: "var(--dim)" },
                    { k: "Signal→Exec",    v: pct(job.signal_to_execution_rate),  color: "var(--dim)" },
                  ].map((m) => (
                    <div key={m.k} style={{ background: "var(--elevated)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{m.k}</div>
                      <div style={{ fontSize: 16, fontFamily: "var(--font-jb)", fontWeight: 700, color: m.color }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Portfolio value breakdown + equity chart */}
              {(job.results?.equity_curve?.length ?? 0) >= 1 && (() => {
                const curve = job.results!.equity_curve;
                const last  = curve[curve.length - 1];
                const total = last.value;
                const cash  = last.cash ?? 0;
                const stocks = Math.max(0, total - cash);
                const fmtV = (v: number) => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(2)}M` : v >= 1_000 ? `$${(v/1_000).toFixed(1)}K` : `$${v.toFixed(0)}`;
                return (
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Breakdown */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      {[
                        { k: "Total Portfolio", v: fmtV(total), color: (total >= (job.initial_capital ?? 100_000)) ? "var(--bull)" : "var(--bear)" },
                        { k: "Cash",            v: fmtV(cash),  color: "var(--dim)" },
                        { k: "Positions",       v: fmtV(stocks), color: stocks > 0 ? "var(--hold)" : "var(--ghost)" },
                      ].map((m) => (
                        <div key={m.k} style={{ background: "var(--elevated)", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{m.k}</div>
                          <div style={{ fontSize: 15, fontFamily: "var(--font-jb)", fontWeight: 700, color: m.color }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                    <EquityChart
                      curve={curve}
                      startDate={job.start_date}
                      endDate={job.end_date}
                      initialCapital={job.initial_capital ?? 100_000}
                      accent={accent}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Daily runs table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                    Daily Runs
                  </div>
                  {runs.length > 0 && (
                    <div style={{ display: "flex", gap: 12, fontSize: 11, fontFamily: "var(--font-nunito)", color: "var(--dim)" }}>
                      <span><span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, color: "var(--bull)" }}>{executed}</span> executed</span>
                      {errors > 0 && <span><span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, color: "var(--bear)" }}>{errors}</span> errors</span>}
                      <span>{runs.length} total signals</span>
                    </div>
                  )}
                </div>
                {runs.length > 0 && (
                  <button onClick={exportCSV} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--line)", color: "var(--ghost)", padding: "4px 12px", borderRadius: 5, cursor: "pointer" }}>
                    ↓ CSV
                  </button>
                )}
              </div>

              {runs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>
                  {isActive ? "No runs yet — job is processing…" : "No daily runs recorded."}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-jb)" }}>
                    <thead>
                      <tr style={{ background: "var(--elevated)", borderBottom: "1px solid var(--line)", position: "sticky", top: 0 }}>
                        {["Date", "Ticker", "Action", "Conf.", "Shares", "Price", "Trade Value", "P&L", "Portfolio", ""].map((h) => (
                          <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r, i) => {
                        const tradeVal = (r.executed && r.shares != null && r.simulated_price != null)
                          ? r.shares * r.simulated_price : null;
                        const isBuy = r.action === "BUY";
                        const portfolioVal = r.portfolio_value_after;
                        return (
                          <tr
                            key={i}
                            onClick={() => router.push(`/admin/jobs/${id}/runs/${r.date}/${r.ticker}`)}
                            style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--elevated)"; (e.currentTarget as HTMLTableRowElement).style.borderLeft = `2px solid ${accent}`; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; (e.currentTarget as HTMLTableRowElement).style.borderLeft = ""; }}
                          >
                            <td style={{ padding: "9px 14px", color: "var(--dim)", whiteSpace: "nowrap", opacity: r.action === "ERROR" ? 0.5 : 1 }}>{r.date}</td>
                            <td style={{ padding: "9px 14px", color: "var(--ink)", fontWeight: 700 }}>{r.ticker}</td>
                            <td style={{ padding: "9px 14px" }}><ActionBadge action={r.action} /></td>
                            <td style={{ padding: "9px 14px", color: "var(--dim)" }}>{conf(r.confidence)}</td>
                            <td style={{ padding: "9px 14px", color: r.executed ? "var(--dim)" : "var(--ghost)" }}>
                              {r.executed && r.shares != null ? r.shares.toFixed(4) : "—"}
                            </td>
                            <td style={{ padding: "9px 14px", color: "var(--dim)" }}>{r.simulated_price != null ? `$${r.simulated_price.toFixed(2)}` : "—"}</td>
                            <td style={{ padding: "9px 14px", fontWeight: tradeVal != null ? 600 : 400, color: tradeVal == null ? "var(--ghost)" : isBuy ? "var(--bull)" : "var(--bear)" }}>
                              {tradeVal == null ? "—" : `${isBuy ? "+" : "-"}$${tradeVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            <td style={{ padding: "9px 14px", color: r.pnl == null ? "var(--ghost)" : r.pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
                              {r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}$${r.pnl.toFixed(2)}`}
                            </td>
                            <td style={{ padding: "9px 14px", color: "var(--dim)" }}>
                              {portfolioVal != null ? `$${portfolioVal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"}
                            </td>
                            <td style={{ padding: "9px 14px", color: "var(--ghost)", fontSize: 13, fontWeight: 700 }}>→</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
