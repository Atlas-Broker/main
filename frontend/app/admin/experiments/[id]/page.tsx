"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type ExperimentType = "philosophy" | "threshold" | "mode" | "single" | "multi";

type BacktestJob = {
  id: string;
  status: JobStatus;
  tickers: string[];
  start_date: string;
  end_date: string;
  ebc_mode: string;
  philosophy_mode?: string | null;
  confidence_threshold?: number | null;
  experiment_id?: string | null;
  progress: number;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  total_trades: number | null;
  signal_to_execution_rate: number | null;
  created_at: string;
  completed_at: string | null;
  error_message?: string | null;
  results?: {
    daily_runs: DailyRun[];
    equity_curve: { date: string; value: number }[];
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
  pnl: number | null;
  skipped_reason: string | null;
  trace_id: string | null;
  error?: string;
};

type Experiment = {
  id: string;
  name: string;
  experiment_type: ExperimentType;
  tickers: string[];
  start_date: string;
  end_date: string;
  ebc_mode: string;
  created_at: string;
  jobs: BacktestJob[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_MS = 24 * 60 * 60 * 1000;

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

function jobLabel(job: BacktestJob, type: ExperimentType): string {
  if (type === "philosophy" && job.philosophy_mode) {
    return job.philosophy_mode.charAt(0).toUpperCase() + job.philosophy_mode.slice(1);
  }
  if (type === "threshold" && job.confidence_threshold != null) {
    return `${(job.confidence_threshold * 100).toFixed(0)}% confidence`;
  }
  if (type === "mode") return job.ebc_mode;
  const parts: string[] = [];
  if (job.philosophy_mode) parts.push(job.philosophy_mode.charAt(0).toUpperCase() + job.philosophy_mode.slice(1));
  if (job.confidence_threshold != null) parts.push(`${(job.confidence_threshold * 100).toFixed(0)}%`);
  return parts.join(" · ") || job.id.slice(0, 8);
}

function jobAccent(job: BacktestJob, type: ExperimentType): string {
  if (type === "philosophy" && job.philosophy_mode) {
    return philosophyColors[job.philosophy_mode] ?? "#3b82f6";
  }
  if (type === "threshold") return "#f59e0b";
  return "#3b82f6";
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
@keyframes exp-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes exp-pulse {
  0%   { opacity: 0.7; transform: scale(1); }
  70%  { opacity: 0;   transform: scale(2.2); }
  100% { opacity: 0;   transform: scale(2.2); }
}
@keyframes exp-fade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.exp-fade { animation: exp-fade 0.2s ease both; }
.exp-shimmer {
  background: linear-gradient(90deg, var(--hold) 0%, #f5c542 40%, var(--hold) 100%);
  background-size: 200% 100%;
  animation: exp-shimmer 1.8s linear infinite;
}
.exp-job-card {
  transition: box-shadow 0.15s, transform 0.1s;
  cursor: pointer;
}
.exp-job-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px); }
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
      <span style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: color, opacity: 0.4, animation: "exp-pulse 1.4s ease-out infinite" }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, position: "relative" }} />
    </span>
  );
}

function ProgressBar({ progress, running }: { progress: number; running: boolean }) {
  return (
    <div style={{ background: "var(--elevated)", borderRadius: 4, height: 4, overflow: "hidden" }}>
      <div
        className={running ? "exp-shimmer" : ""}
        style={{ width: `${progress}%`, height: "100%", borderRadius: 4, background: running ? undefined : "var(--bull)", transition: "width 0.6s ease" }}
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
    <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, color, background: bg }}>
      {action}
    </span>
  );
}

// ── Daily Logs Panel ──────────────────────────────────────────────────────────

function DailyLogsPanel({ job, onClose }: { job: BacktestJob; onClose: () => void }) {
  const [fullJob, setFullJob] = useState<BacktestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetchWithAuth(`${API}/v1/backtest/${job.id}`)
      .then(async (r) => { if (r?.ok) setFullJob(await r.json()); })
      .finally(() => setLoading(false));
  }, [job.id]);

  const runs = fullJob?.results?.daily_runs ?? [];
  const executed = runs.filter((r) => r.executed).length;
  const errors   = runs.filter((r) => r.action === "ERROR").length;

  function exportCSV() {
    const header = "date,ticker,action,confidence,executed,price,pnl,reason\n";
    const rows = runs.map((r) =>
      [r.date, r.ticker, r.action, r.confidence ?? "", r.executed, r.simulated_price ?? "", r.pnl ?? "",
       `"${(r.skipped_reason ?? r.reasoning ?? "").replace(/"/g, "'")}"`].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `job-${job.id.slice(0, 8)}-runs.csv`;
    a.click();
  }

  return (
    <div style={{ background: "var(--deep)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", marginTop: 12 }} className="exp-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
            Daily Runs — {job.id.slice(0, 8)}
          </div>
          {!loading && runs.length > 0 && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--dim)", fontFamily: "var(--font-nunito)" }}>
              <span style={{ color: "var(--bull)", fontWeight: 700 }}>{executed}</span> executed
              {errors > 0 && <><span style={{ color: "var(--bear)", fontWeight: 700 }}>{errors}</span> errors</>}
              · {runs.length} total
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {runs.length > 0 && (
            <button onClick={exportCSV} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 5, padding: "4px 10px", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
              ↓ CSV
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: "16px 0", color: "var(--ghost)", fontSize: 12 }}>Loading…</div>}
      {!loading && runs.length === 0 && <div style={{ textAlign: "center", padding: "16px 0", color: "var(--ghost)", fontSize: 12 }}>No runs yet.</div>}

      {!loading && runs.length > 0 && (
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-jb)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--deep)" }}>
                {["Date", "Ticker", "Action", "Conf.", "Executed", "Price", "PnL", ""].map((h) => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <React.Fragment key={i}>
                  <tr
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    style={{ borderBottom: expanded === i ? "none" : "1px solid var(--line)", opacity: r.action === "ERROR" ? 0.5 : r.executed ? 1 : 0.65, cursor: "pointer" }}
                  >
                    <td style={{ padding: "7px 10px", color: "var(--dim)", whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ padding: "7px 10px", color: "var(--ink)", fontWeight: 700 }}>{r.ticker}</td>
                    <td style={{ padding: "7px 10px" }}><ActionBadge action={r.action} /></td>
                    <td style={{ padding: "7px 10px", color: "var(--dim)" }}>{conf(r.confidence)}</td>
                    <td style={{ padding: "7px 10px", color: r.executed ? "var(--bull)" : "var(--ghost)" }}>{r.executed ? "✓" : "—"}</td>
                    <td style={{ padding: "7px 10px", color: "var(--dim)" }}>{r.simulated_price != null ? `$${r.simulated_price.toFixed(2)}` : "—"}</td>
                    <td style={{ padding: "7px 10px", color: r.pnl == null ? "var(--ghost)" : r.pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
                      {r.pnl == null ? "—" : `${r.pnl >= 0 ? "+" : ""}$${r.pnl.toFixed(2)}`}
                    </td>
                    <td style={{ padding: "7px 10px", color: "var(--ghost)", fontSize: 9 }}>{r.reasoning || r.skipped_reason ? "▸" : ""}</td>
                  </tr>
                  {expanded === i && (r.reasoning || r.skipped_reason || r.error) && (
                    <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--elevated)" }}>
                      <td colSpan={8} style={{ padding: "8px 10px 10px 32px" }}>
                        {r.error && <div style={{ color: "var(--bear)", fontSize: 11, marginBottom: 4 }}>Error: {r.error}</div>}
                        {r.skipped_reason && <div style={{ color: "var(--dim)", fontSize: 11, marginBottom: 4 }}>Skipped: {r.skipped_reason}</div>}
                        {r.reasoning && <div style={{ color: "var(--dim)", fontSize: 11, lineHeight: 1.5 }}>{r.reasoning}</div>}
                        {r.trace_id && <div style={{ marginTop: 6, fontSize: 9, color: "var(--ghost)" }}>trace {r.trace_id.slice(0, 16)}…</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({ job, type, onCancel, onResume }: {
  job: BacktestJob;
  type: ExperimentType;
  onCancel: () => void;
  onResume: () => void;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const isActive = job.status === "running" || job.status === "queued";
  const isStale  = isActive && Date.now() - new Date(job.created_at).getTime() > STALE_MS;
  const accent   = jobAccent(job, type);
  const label    = jobLabel(job, type);

  return (
    <div className="exp-fade">
      <div
        className="exp-job-card"
        onClick={() => setShowLogs((v) => !v)}
        style={{
          background: "var(--surface)",
          borderTop:    `1px solid ${showLogs ? `${accent}40` : "var(--line)"}`,
          borderRight:  `1px solid ${showLogs ? `${accent}40` : "var(--line)"}`,
          borderBottom: `1px solid ${showLogs ? `${accent}40` : "var(--line)"}`,
          borderLeft:   `4px solid ${accent}`,
          borderRadius: 10,
          padding: "16px 18px",
        }}
      >
        {/* Label + status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 15, color: accent, marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ fontFamily: "var(--font-jb)", fontSize: 9, color: "var(--ghost)" }}>
              {job.id.slice(0, 8)} · {relTime(job.created_at)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isActive && !isStale && <PulsingDot />}
            <span style={{
              fontSize: 9, fontFamily: "var(--font-jb)", color: isStale ? "var(--bear)" : statusColor[job.status],
              padding: "2px 7px", borderRadius: 3,
              background: `${isStale ? "var(--bear)" : statusColor[job.status]}15`,
              border: `1px solid ${isStale ? "var(--bear)" : statusColor[job.status]}30`,
            }}>
              {isStale ? "stale" : job.status}
            </span>
          </div>
        </div>

        {/* Progress */}
        {isActive && (
          <div style={{ marginBottom: 12 }}>
            <ProgressBar progress={job.progress} running={job.status === "running"} />
            <div style={{ marginTop: 4, fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
              {job.progress}% complete
            </div>
          </div>
        )}

        {/* Metrics */}
        {job.status === "completed" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
            {[
              { k: "RETURN",   v: pct(job.total_return),  col: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" },
              { k: "SHARPE",   v: fmt(job.sharpe_ratio),  col: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--dim)" },
              { k: "MAX DD",   v: pct(job.max_drawdown),  col: "var(--bear)" },
              { k: "WIN RATE", v: pct(job.win_rate),      col: "var(--dim)" },
            ].map((m) => (
              <div key={m.k} style={{ textAlign: "center", background: "var(--elevated)", borderRadius: 6, padding: "8px 4px" }}>
                <div style={{ fontSize: 8, fontFamily: "var(--font-jb)", color: "var(--ghost)", marginBottom: 3 }}>{m.k}</div>
                <div style={{ fontSize: 14, fontFamily: "var(--font-jb)", fontWeight: 700, color: m.col }}>{m.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {job.status === "failed" && (
          <div style={{ fontSize: 11, color: "var(--bear)", background: "var(--bear-bg)", borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>
            {job.error_message ?? "Pipeline failed"}
          </div>
        )}

        {/* Actions row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(isActive || isStale) && (
              <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--bear)40", color: "var(--bear)", padding: "3px 10px", borderRadius: 5, cursor: "pointer" }}>
                Cancel
              </button>
            )}
            {(job.status === "failed" || job.status === "cancelled") && (
              <button onClick={(e) => { e.stopPropagation(); onResume(); }} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--brand)40", color: "var(--brand)", padding: "3px 10px", borderRadius: 5, cursor: "pointer" }}>
                Resume
              </button>
            )}
          </div>
          <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)", opacity: 0.7 }}>
            {showLogs ? "hide runs ▴" : "view runs ▾"}
          </span>
        </div>
      </div>

      {showLogs && <DailyLogsPanel job={job} onClose={() => setShowLogs(false)} />}
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable({ experiment }: { experiment: Experiment }) {
  const completed = experiment.jobs.filter((j) => j.status === "completed");
  if (completed.length === 0) return null;

  const sorted  = [...completed].sort((a, b) => (b.sharpe_ratio ?? -Infinity) - (a.sharpe_ratio ?? -Infinity));
  const bestId  = sorted[0]?.id;
  const worstId = sorted[sorted.length - 1]?.id;

  function exportCSV() {
    const header = "label,total_return,sharpe,max_drawdown,win_rate,trades,sig_exec\n";
    const rows = sorted.map((j) =>
      [jobLabel(j, experiment.experiment_type), j.total_return ?? "", j.sharpe_ratio ?? "", j.max_drawdown ?? "", j.win_rate ?? "", j.total_trades ?? "", j.signal_to_execution_rate ?? ""].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `experiment-${experiment.id.slice(0, 8)}.csv`;
    a.click();
  }

  const colHeader = experiment.experiment_type === "philosophy" ? "Philosophy"
    : experiment.experiment_type === "threshold" ? "Threshold"
    : "Variant";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Results — ranked by Sharpe {completed.length < experiment.jobs.length && `(${experiment.jobs.length - completed.length} still running)`}
        </span>
        <button onClick={exportCSV} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--line)", color: "var(--ghost)", padding: "4px 12px", borderRadius: 5, cursor: "pointer" }}>
          ↓ Export CSV
        </button>
      </div>

      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--line)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-jb)" }}>
          <thead>
            <tr style={{ background: "var(--elevated)", borderBottom: "1px solid var(--line)" }}>
              {[colHeader, "Cum. Return", "Sharpe", "Max Drawdown", "Win Rate", "Trades", "Signal→Exec"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => {
              const isBest  = job.id === bestId;
              const isWorst = job.id === worstId && sorted.length > 1;
              const accent  = jobAccent(job, experiment.experiment_type);
              const rowBg   = isBest  ? "color-mix(in srgb, var(--bull) 7%, transparent)"
                            : isWorst ? "color-mix(in srgb, var(--bear) 7%, transparent)"
                            : "transparent";
              return (
                <tr key={job.id} style={{ borderBottom: "1px solid var(--line)", background: rowBg }}>
                  <td style={{ padding: "11px 14px", borderLeft: `3px solid ${accent}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isBest  && <span style={{ color: "var(--bull)", fontSize: 10 }}>▲</span>}
                      {isWorst && <span style={{ color: "var(--bear)", fontSize: 10 }}>▼</span>}
                      <span style={{ fontWeight: 700, color: accent }}>{jobLabel(job, experiment.experiment_type)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px", color: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>{pct(job.total_return)}</td>
                  <td style={{ padding: "11px 14px", color: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--dim)", fontWeight: 600 }}>{fmt(job.sharpe_ratio)}</td>
                  <td style={{ padding: "11px 14px", color: "var(--bear)" }}>{pct(job.max_drawdown)}</td>
                  <td style={{ padding: "11px 14px", color: "var(--dim)" }}>{pct(job.win_rate)}</td>
                  <td style={{ padding: "11px 14px", color: "var(--dim)" }}>{job.total_trades ?? "—"}</td>
                  <td style={{ padding: "11px 14px", color: "var(--dim)" }}>{pct(job.signal_to_execution_rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [exp, setExp]       = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithAuth(`${API}/v1/experiments/${id}`);
    if (!res?.ok) { setError("Experiment not found."); return; }
    setExp(await res.json());
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Poll every 5s while any jobs active
  useEffect(() => {
    if (!exp) return;
    const hasActive = exp.jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasActive) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [exp, load]);

  async function cancelJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/cancel`, { method: "POST" });
    await load();
  }
  async function resumeJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/resume`, { method: "POST" });
    await load();
  }

  const activeCount    = exp?.jobs.filter((j) => j.status === "running" || j.status === "queued").length ?? 0;
  const completedCount = exp?.jobs.filter((j) => j.status === "completed").length ?? 0;
  const failedCount    = exp?.jobs.filter((j) => j.status === "failed" || j.status === "cancelled").length ?? 0;

  return (
    <>
      <StyleInjector />
      <div style={{ minHeight: "100vh", background: "var(--page)", color: "var(--ink)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }}>

          {/* Nav */}
          <button
            onClick={() => router.push("/admin")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontFamily: "var(--font-jb)", fontSize: 11, marginBottom: 24, padding: 0 }}
          >
            ← Back to Admin
          </button>

          {loading && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ghost)", fontFamily: "var(--font-nunito)" }}>Loading experiment…</div>
          )}

          {error && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "var(--bear)", fontFamily: "var(--font-nunito)" }}>{error}</div>
          )}

          {!loading && exp && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }} className="exp-fade">

              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <h1 style={{ margin: 0, fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>
                      {exp.name}
                    </h1>
                    <span style={{
                      fontSize: 10, fontFamily: "var(--font-jb)", padding: "3px 10px", borderRadius: 4,
                      background: "var(--elevated)", border: "1px solid var(--line)", color: "var(--ghost)",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {exp.experiment_type}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
                    {exp.tickers.join(" · ")} · {exp.start_date} → {exp.end_date} · {exp.ebc_mode} · {relTime(exp.created_at)}
                  </div>
                </div>

                {/* Status summary */}
                <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  {activeCount > 0 && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center" }}>
                        <PulsingDot /> <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 18, color: "var(--hold)" }}>{activeCount}</span>
                      </div>
                      <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase" }}>running</div>
                    </div>
                  )}
                  {completedCount > 0 && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 18, color: "var(--bull)" }}>{completedCount}</div>
                      <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase" }}>done</div>
                    </div>
                  )}
                  {failedCount > 0 && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 18, color: "var(--bear)" }}>{failedCount}</div>
                      <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase" }}>failed</div>
                    </div>
                  )}
                  <button onClick={load} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--line)", color: "var(--ghost)", padding: "4px 10px", borderRadius: 5, cursor: "pointer", alignSelf: "center" }}>
                    ↺
                  </button>
                </div>
              </div>

              {/* Comparison table */}
              <div style={{ background: "var(--surface)", borderRadius: 10, border: "1px solid var(--line)", padding: "20px 24px" }}>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: 700, color: "var(--ink)", marginBottom: 16, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Summary
                </div>
                {completedCount === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "var(--ghost)", fontFamily: "var(--font-nunito)", fontSize: 13 }}>
                    Results will appear here as runs complete.
                  </div>
                ) : (
                  <ComparisonTable experiment={exp} />
                )}
              </div>

              {/* Job cards */}
              <div>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  Runs ({exp.jobs.length})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {exp.jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      type={exp.experiment_type}
                      onCancel={() => cancelJob(job.id)}
                      onResume={() => resumeJob(job.id)}
                    />
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
