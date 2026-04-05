"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type PageTab   = "experiments" | "jobs";
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
  directional_accuracy?: number | null;
  created_at: string;
  completed_at: string | null;
  error_message?: string | null;
  results?: BacktestResults;
};

type BacktestResults = {
  daily_runs: DailyRun[];
  equity_curve: { date: string; value: number; cash?: number }[];
  metrics: Record<string, unknown>;
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

// Experiment from backend API
type BackendExperiment = {
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

// Client-side experiment (for orphan jobs or as display wrapper)
type Experiment = {
  id: string;
  type: ExperimentType;
  label: string;
  jobs: BacktestJob[];
  createdAt: Date;
  isBackendBacked: boolean;   // true = came from /v1/experiments
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PHILOSOPHIES = ["lynch", "soros", "buffett", "balanced"] as const;
const THRESHOLDS   = [0.50, 0.65, 0.80, 0.95] as const;
const EBC_MODES    = ["advisory", "autonomous"] as const;

const DEFAULT_START   = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
const DEFAULT_END     = new Date(Date.now() - 3  * 86400000).toISOString().slice(0, 10);
const DEFAULT_TICKERS = "AAPL, MSFT, TSLA, NVDA, META";

const STALE_MS = 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, dec = 2) =>
  n == null || isNaN(n as number) ? "—" : (n as number).toFixed(dec);

const pct = (n: number | null | undefined) =>
  n == null || isNaN(n as number) ? "—" : `${((n as number) * 100).toFixed(2)}%`;

const conf = (n: number | null | undefined) =>
  n == null || isNaN(n as number) ? "—" : `${Math.round((n as number) * 100)}%`;

const statusColor: Record<JobStatus, string> = {
  queued:    "var(--dim)",
  running:   "var(--hold)",
  completed: "var(--bull)",
  failed:    "var(--bear)",
  cancelled: "var(--dim)",
};

const modeColor: Record<string, string> = {
  advisory:             "var(--dim)",
  conditional:          "var(--hold)",
  autonomous_guardrail: "var(--brand)",
  autonomous:           "var(--bull)",
};

const philosophyColors: Record<string, string> = {
  lynch:    "#6366f1",
  soros:    "#f59e0b",
  buffett:  "#10b981",
  balanced: "var(--brand)",
};

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function tradingDayEst(start: string, end: string) {
  if (!start || !end) return 0;
  let days = 0;
  const cur = new Date(start);
  const e = new Date(end);
  while (cur <= e) { if (cur.getDay() !== 0 && cur.getDay() !== 6) days++; cur.setDate(cur.getDate() + 1); }
  return days;
}

// ── Orphan-job grouping (for jobs without experiment_id) ──────────────────────

function groupOrphanJobs(jobs: BacktestJob[]): Experiment[] {
  const sorted = [...jobs].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const byBase = new Map<string, BacktestJob[]>();
  for (const job of sorted) {
    const key = [...job.tickers].sort().join(",") + "|" + job.start_date + "|" + job.end_date;
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key)!.push(job);
  }

  const experiments: Experiment[] = [];
  let idx = 0;

  for (const baseJobs of byBase.values()) {
    // Sub-group by 15-min time proximity
    const timeGroups: BacktestJob[][] = [];
    let cur: BacktestJob[] = [];
    for (const job of baseJobs) {
      if (cur.length === 0) {
        cur.push(job);
      } else {
        const gap = new Date(job.created_at).getTime() - new Date(cur[cur.length - 1].created_at).getTime();
        if (gap < 15 * 60 * 1000) { cur.push(job); } else { timeGroups.push(cur); cur = [job]; }
      }
    }
    if (cur.length > 0) timeGroups.push(cur);

    for (const tg of timeGroups) {
      // Split into null-threshold (philosophy candidates) vs has-threshold (threshold candidates)
      // This prevents philosophy jobs and threshold jobs submitted close together from merging.
      const nullThresh = tg.filter((j) => j.confidence_threshold == null);
      const hasThresh  = tg.filter((j) => j.confidence_threshold != null);

      const subGroups = [nullThresh, hasThresh].filter((g) => g.length > 0);

      for (const sg of subGroups) {
        const philosophies = new Set(sg.map((j) => j.philosophy_mode).filter(Boolean));
        const thresholds   = new Set(sg.map((j) => j.confidence_threshold).filter((v) => v != null));
        const modes        = new Set(sg.map((j) => j.ebc_mode));
        const createdAt    = new Date(Math.max(...sg.map((j) => new Date(j.created_at).getTime())));

        let type: ExperimentType;
        let label: string;
        if (sg.length === 1)         { type = "single";    label = "Single Run"; }
        else if (thresholds.size > 1) { type = "threshold"; label = "Confidence Threshold Comparison"; }
        else if (philosophies.size > 1){ type = "philosophy"; label = "Philosophy Comparison"; }
        else if (modes.size > 1)      { type = "mode";      label = "Mode Comparison"; }
        else                          { type = "multi";     label = `${sg.length}-Run Group`; }

        experiments.push({ id: `orphan-${idx++}`, type, label, jobs: sg, createdAt, isBackendBacked: false });
      }
    }
  }

  return experiments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function backendToExperiment(be: BackendExperiment): Experiment {
  return {
    id: be.id,
    type: be.experiment_type,
    label: be.name,
    jobs: be.jobs,
    createdAt: new Date(be.created_at),
    isBackendBacked: true,
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const COMP_STYLES = `
@keyframes bcv-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes bcv-pulse-ring {
  0%   { opacity: 0.7; transform: scale(1); }
  70%  { opacity: 0;   transform: scale(2.2); }
  100% { opacity: 0;   transform: scale(2.2); }
}
@keyframes bcv-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.bcv-fade-in { animation: bcv-fade-in 0.25s ease both; }
.bcv-shimmer-bar {
  background: linear-gradient(90deg, var(--hold) 0%, #f5c542 40%, var(--hold) 100%);
  background-size: 200% 100%;
  animation: bcv-shimmer 1.8s linear infinite;
}
.bcv-job-card { transition: box-shadow 0.15s, border-color 0.15s; cursor: pointer; }
.bcv-job-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-color: var(--brand) !important; }
.bcv-tab { transition: color 0.15s, border-color 0.15s; }
`;

function StyleInjector() {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return; ref.current = true;
    const el = document.createElement("style");
    el.textContent = COMP_STYLES;
    document.head.appendChild(el);
  }, []);
  return null;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function PulsingDot({ color = "var(--hold)" }: { color?: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: color, opacity: 0.4, animation: "bcv-pulse-ring 1.4s ease-out infinite" }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, position: "relative" }} />
    </span>
  );
}

function ProgressBar({ progress, running }: { progress: number; running: boolean }) {
  return (
    <div style={{ background: "var(--elevated)", borderRadius: 4, height: 4, overflow: "hidden" }}>
      <div
        className={running ? "bcv-shimmer-bar" : ""}
        style={{ width: `${progress}%`, height: "100%", borderRadius: 4, background: running ? undefined : "var(--bull)", transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }}
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

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: "var(--font-jb)", color: statusColor[status],
      padding: "1px 6px", borderRadius: 3,
      background: `${statusColor[status]}15`,
      border: `1px solid ${statusColor[status]}30`,
    }}>
      {status}
    </span>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color, background: `${color}18`, padding: "2px 8px", borderRadius: 4, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink)", fontFamily: "var(--font-nunito)", fontSize: 13,
  boxSizing: "border-box",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 6 }}>
        {label}{hint && <span style={{ marginLeft: 8, opacity: 0.6 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Job label / color within an experiment ────────────────────────────────────

function jobLabel(job: BacktestJob, expType: ExperimentType): string {
  if (expType === "philosophy" && job.philosophy_mode) {
    return job.philosophy_mode.charAt(0).toUpperCase() + job.philosophy_mode.slice(1);
  }
  if (expType === "threshold" && job.confidence_threshold != null) {
    return `${(job.confidence_threshold * 100).toFixed(0)}% threshold`;
  }
  if (expType === "mode") return job.ebc_mode;
  return job.tickers.join(", ");
}

function jobAccentColor(job: BacktestJob, expType: ExperimentType): string {
  if (expType === "philosophy" && job.philosophy_mode) {
    return philosophyColors[job.philosophy_mode] ?? "var(--brand)";
  }
  return modeColor[job.ebc_mode] ?? "var(--brand)";
}

// ── Daily logs panel ──────────────────────────────────────────────────────────

function JobLogsPanel({ job, onClose }: { job: BacktestJob; onClose: () => void }) {
  const [fullJob, setFullJob] = useState<BacktestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    fetchWithAuth(`${API}/v1/backtest/${job.id}`)
      .then(async (res) => { if (res?.ok) setFullJob(await res.json()); })
      .finally(() => setLoading(false));
  }, [job.id]);

  const runs = fullJob?.results?.daily_runs ?? [];
  const errorCount    = runs.filter((r) => r.action === "ERROR").length;
  const executedCount = runs.filter((r) => r.executed).length;

  function exportCSV() {
    const header = "date,ticker,action,confidence,executed,price,pnl,reason\n";
    const rows = runs.map((r) =>
      [r.date, r.ticker, r.action, r.confidence ?? "", r.executed, r.simulated_price ?? "", r.pnl ?? "",
       `"${(r.skipped_reason ?? r.reasoning ?? "").replace(/"/g, "'")}"`].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `backtest-${job.id.slice(0, 8)}-runs.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bcv-fade-in" style={{ background: "var(--deep)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>
            Daily Runs — {job.id.slice(0, 8)}
          </div>
          {!loading && runs.length > 0 && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, fontFamily: "var(--font-nunito)", color: "var(--dim)" }}>
              <span><span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, color: "var(--bull)" }}>{executedCount}</span> executed</span>
              {errorCount > 0 && <span><span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, color: "var(--bear)" }}>{errorCount}</span> errors</span>}
              <span>{runs.length} total signals</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {runs.length > 0 && (
            <button onClick={exportCSV} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 5, padding: "4px 10px", color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", cursor: "pointer" }}>
              ↓ CSV
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)", textAlign: "center", padding: "16px 0" }}>Loading…</div>}
      {!loading && runs.length === 0 && (
        <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "16px 0" }}>No daily runs recorded yet.</div>
      )}

      {!loading && runs.length > 0 && (
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-jb)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--deep)" }}>
                {["Date", "Ticker", "Action", "Conf.", "Executed", "Price", "PnL", ""].map((h) => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((dr, i) => (
                <React.Fragment key={i}>
                  <tr
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    style={{ borderBottom: expandedRow === i ? "none" : "1px solid var(--line)", opacity: dr.action === "ERROR" ? 0.5 : dr.executed ? 1 : 0.65, cursor: "pointer" }}
                  >
                    <td style={{ padding: "7px 10px", color: "var(--dim)", whiteSpace: "nowrap" }}>{dr.date}</td>
                    <td style={{ padding: "7px 10px", color: "var(--ink)", fontWeight: 700 }}>{dr.ticker}</td>
                    <td style={{ padding: "7px 10px" }}><ActionBadge action={dr.action} /></td>
                    <td style={{ padding: "7px 10px", color: "var(--dim)" }}>{conf(dr.confidence)}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ color: dr.executed ? "var(--bull)" : "var(--ghost)", fontSize: 11 }}>{dr.executed ? "✓ exec" : "—"}</span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "var(--dim)" }}>
                      {dr.simulated_price != null ? `$${dr.simulated_price.toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", color: dr.pnl == null ? "var(--ghost)" : dr.pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
                      {dr.pnl == null ? "—" : `${dr.pnl >= 0 ? "+" : ""}$${dr.pnl.toFixed(2)}`}
                    </td>
                    <td style={{ padding: "7px 10px", color: "var(--ghost)", fontSize: 9 }}>{dr.reasoning || dr.skipped_reason ? "▸" : ""}</td>
                  </tr>
                  {expandedRow === i && (dr.reasoning || dr.skipped_reason || dr.error) && (
                    <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--elevated)" }}>
                      <td colSpan={8} style={{ padding: "8px 10px 10px 38px" }}>
                        {dr.error && <div style={{ color: "var(--bear)", fontSize: 11, fontFamily: "var(--font-nunito)", marginBottom: dr.reasoning ? 6 : 0 }}>Error: {dr.error}</div>}
                        {dr.skipped_reason && !dr.executed && <div style={{ color: "var(--dim)", fontSize: 11, fontFamily: "var(--font-nunito)", marginBottom: dr.reasoning ? 6 : 0 }}>Skipped: {dr.skipped_reason}</div>}
                        {dr.reasoning && <div style={{ color: "var(--dim)", fontSize: 11, fontFamily: "var(--font-nunito)", lineHeight: 1.5 }}>{dr.reasoning}</div>}
                        {dr.trace_id && <div style={{ marginTop: 6, fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>trace {dr.trace_id.slice(0, 16)}…</div>}
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

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({ job, expType, onCancel, onResume }: {
  job: BacktestJob;
  expType: ExperimentType;
  onCancel: () => void;
  onResume: () => void;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const isActive = job.status === "running" || job.status === "queued";
  const isStale  = isActive && (Date.now() - new Date(job.created_at).getTime()) > STALE_MS;
  const accent   = jobAccentColor(job, expType);
  const label    = jobLabel(job, expType);

  return (
    <div>
      <div
        className="bcv-job-card"
        onClick={() => !isActive && setShowLogs((v) => !v)}
        style={{
          background: "var(--surface)",
          border: `1px solid ${isActive ? "var(--hold)40" : showLogs ? "var(--brand)50" : "var(--line)"}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: 8,
          padding: "12px 14px",
          cursor: isActive ? "default" : "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 12, color: accent }}>{label}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isActive && <PulsingDot />}
            <StatusBadge status={isStale ? "failed" : job.status} />
            {isStale && <span style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--bear)" }}>stale</span>}
          </div>
        </div>

        {isActive && (
          <div>
            <ProgressBar progress={job.progress} running={job.status === "running"} />
            <div style={{ marginTop: 4, fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
              {job.progress}% — {job.status}
            </div>
          </div>
        )}

        {job.status === "completed" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 4 }}>
            {[
              { k: "RETURN", v: pct(job.total_return), pos: (job.total_return ?? 0) >= 0 },
              { k: "SHARPE", v: fmt(job.sharpe_ratio), pos: (job.sharpe_ratio ?? 0) >= 1 },
              { k: "MAX DD", v: pct(job.max_drawdown), pos: false },
            ].map((m) => (
              <div key={m.k} style={{ textAlign: "center" }}>
                <div style={{ color: "var(--ghost)", fontSize: 8, fontFamily: "var(--font-jb)", marginBottom: 1 }}>{m.k}</div>
                <div style={{ fontSize: 12, fontFamily: "var(--font-jb)", fontWeight: 700, color: m.k === "MAX DD" ? "var(--bear)" : m.pos ? "var(--bull)" : "var(--bear)" }}>
                  {m.v}
                </div>
              </div>
            ))}
          </div>
        )}

        {job.status === "failed" && (
          <div style={{ fontSize: 10, color: "var(--bear)", fontFamily: "var(--font-nunito)", marginTop: 4 }}>
            {job.error_message ?? "Pipeline failed"}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {(isActive || isStale) && (
            <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--bear)40", color: "var(--bear)", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
              cancel
            </button>
          )}
          {(job.status === "failed" || job.status === "cancelled") && (
            <button onClick={(e) => { e.stopPropagation(); onResume(); }} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--brand)40", color: "var(--brand)", padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
              resume
            </button>
          )}
          {job.status === "completed" && (
            <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)", marginLeft: "auto", opacity: 0.6 }}>
              {showLogs ? "hide logs ▴" : "view logs ▾"}
            </span>
          )}
        </div>
      </div>

      {showLogs && <JobLogsPanel job={job} onClose={() => setShowLogs(false)} />}
    </div>
  );
}

// ── Comparison table ───────────────────────────────────────────────────────────

function ComparisonTable({ experiment }: { experiment: Experiment }) {
  const completed = experiment.jobs.filter((j) => j.status === "completed");
  if (completed.length < 2) return null;

  const sorted  = [...completed].sort((a, b) => (b.sharpe_ratio ?? -Infinity) - (a.sharpe_ratio ?? -Infinity));
  const bestId  = sorted[0]?.id;
  const worstId = sorted[sorted.length - 1]?.id;

  function exportCSV() {
    const header = "label,total_return,sharpe,max_drawdown,win_rate,trades,sig_exec\n";
    const rows = sorted.map((j) =>
      [jobLabel(j, experiment.type), j.total_return ?? "", j.sharpe_ratio ?? "", j.max_drawdown ?? "", j.win_rate ?? "", j.total_trades ?? "", j.signal_to_execution_rate ?? ""].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
    a.download = `experiment-comparison-${experiment.jobs[0].start_date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Comparison — ranked by Sharpe ↓
        </span>
        <button onClick={exportCSV} style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--line)", color: "var(--ghost)", padding: "3px 10px", borderRadius: 4, cursor: "pointer" }}>
          ↓ Export CSV
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-jb)" }}>
          <thead>
            <tr style={{ background: "var(--elevated)", borderBottom: "1px solid var(--line)" }}>
              {[experiment.type === "philosophy" ? "Philosophy" : experiment.type === "threshold" ? "Threshold" : "Variant",
                "Cum. Return", "Sharpe", "Max Drawdown", "Win Rate", "Trades", "Signal→Exec"].map((h) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => {
              const isBest  = job.id === bestId;
              const isWorst = job.id === worstId && sorted.length > 1;
              const accent  = jobAccentColor(job, experiment.type);
              const rowBg   = isBest ? "color-mix(in srgb, var(--bull) 6%, transparent)" :
                              isWorst ? "color-mix(in srgb, var(--bear) 6%, transparent)" : "transparent";
              return (
                <tr key={job.id} style={{ borderBottom: "1px solid var(--line)", background: rowBg }}>
                  <td style={{ padding: "9px 12px", fontWeight: 700, whiteSpace: "nowrap", borderLeft: `3px solid ${accent}` }}>
                    {isBest  && <span style={{ color: "var(--bull)", marginRight: 5, fontSize: 9 }}>▲</span>}
                    {isWorst && <span style={{ color: "var(--bear)", marginRight: 5, fontSize: 9 }}>▼</span>}
                    <span style={{ color: accent }}>{jobLabel(job, experiment.type)}</span>
                  </td>
                  <td style={{ padding: "9px 12px", color: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" }}>{pct(job.total_return)}</td>
                  <td style={{ padding: "9px 12px", color: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--dim)" }}>{fmt(job.sharpe_ratio)}</td>
                  <td style={{ padding: "9px 12px", color: "var(--bear)" }}>{pct(job.max_drawdown)}</td>
                  <td style={{ padding: "9px 12px", color: "var(--dim)" }}>{pct(job.win_rate)}</td>
                  <td style={{ padding: "9px 12px", color: "var(--dim)" }}>{job.total_trades ?? "—"}</td>
                  <td style={{ padding: "9px 12px", color: "var(--dim)" }}>{pct(job.signal_to_execution_rate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Experiment card (expandable accordion) ────────────────────────────────────

function ExperimentCard({ experiment, defaultOpen, onJobsChanged }: {
  experiment: Experiment;
  defaultOpen?: boolean;
  onJobsChanged: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const activeCount    = experiment.jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const completedCount = experiment.jobs.filter((j) => j.status === "completed").length;
  const errorCount     = experiment.jobs.filter((j) => j.status === "failed" || j.status === "cancelled").length;
  const allDone        = experiment.jobs.every((j) => ["completed", "failed", "cancelled"].includes(j.status));
  const hasStale       = experiment.jobs.some(
    (j) => (j.status === "running" || j.status === "queued") && Date.now() - new Date(j.created_at).getTime() > STALE_MS
  );

  async function cancelJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/cancel`, { method: "POST" });
    onJobsChanged();
  }
  async function resumeJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/resume`, { method: "POST" });
    onJobsChanged();
  }

  const typeColor: Record<ExperimentType, string> = {
    philosophy: philosophyColors.lynch,
    threshold:  "#f59e0b",
    mode:       "var(--brand)",
    single:     "var(--dim)",
    multi:      "var(--brand)",
  };
  const accent = typeColor[experiment.type];

  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${open ? "var(--brand)30" : "var(--line)"}`, borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ width: 3, height: 36, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{experiment.label}</span>
            <Pill label={`${experiment.jobs.length} runs`} color={accent} />
            {activeCount > 0 && <PulsingDot color="var(--hold)" />}
            {allDone && completedCount > 0 && <Pill label="complete" color="var(--bull)" />}
            {hasStale && <Pill label="stale" color="var(--bear)" />}
            {experiment.isBackendBacked && <Pill label="tracked" color="var(--ghost)" />}
          </div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)" }}>
            {experiment.jobs[0]?.tickers.join(" · ")} · {experiment.jobs[0]?.start_date} → {experiment.jobs[0]?.end_date} · {relTime(experiment.createdAt.toISOString())}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {completedCount > 0 && <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--bull)" }}>{completedCount} done</span>}
          {errorCount > 0 && <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--bear)" }}>{errorCount} failed</span>}
          {activeCount > 0 && <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--hold)" }}>{activeCount} running</span>}
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 12, color: "var(--ghost)", marginLeft: 4 }}>{open ? "▴" : "▾"}</span>
        </div>
      </button>

      {open && (
        <div style={{ padding: "4px 18px 18px", borderTop: "1px solid var(--line)" }} className="bcv-fade-in">
          <div style={{
            display: "grid",
            gridTemplateColumns: experiment.jobs.length === 1 ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}>
            {experiment.jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                expType={experiment.type}
                onCancel={() => cancelJob(job.id)}
                onResume={() => resumeJob(job.id)}
              />
            ))}
          </div>
          <ComparisonTable experiment={experiment} />
        </div>
      )}
    </div>
  );
}

// ── Flat job row (for Jobs tab) ───────────────────────────────────────────────

function JobRow({ job, onCancel, onResume }: {
  job: BacktestJob;
  onCancel: () => void;
  onResume: () => void;
}) {
  const isActive = job.status === "running" || job.status === "queued";
  const isStale  = isActive && Date.now() - new Date(job.created_at).getTime() > STALE_MS;
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div style={{ background: "var(--surface)", border: `1px solid ${isActive ? "var(--hold)30" : "var(--line)"}`, borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => !isActive && setShowLogs((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", cursor: isActive ? "default" : "pointer" }}
      >
        {/* Status dot */}
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: isStale ? "var(--bear)" : statusColor[job.status], flexShrink: 0 }} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 11, color: "var(--ink)" }}>
              {job.tickers.join(" · ")}
            </span>
            {job.philosophy_mode && (
              <span style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: philosophyColors[job.philosophy_mode] ?? "var(--brand)" }}>
                {job.philosophy_mode}
              </span>
            )}
            {job.confidence_threshold != null && (
              <span style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--dim)" }}>
                {(job.confidence_threshold * 100).toFixed(0)}% conf
              </span>
            )}
            {isStale && <Pill label="stale" color="var(--bear)" />}
          </div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 9, color: "var(--ghost)" }}>
            {job.start_date} → {job.end_date} · {job.ebc_mode} · {relTime(job.created_at)} · {job.id.slice(0, 8)}
          </div>
        </div>

        {/* Progress / metrics */}
        {isActive ? (
          <div style={{ width: 120 }}>
            <ProgressBar progress={job.progress} running={job.status === "running"} />
            <div style={{ marginTop: 3, fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textAlign: "right" }}>{job.progress}%</div>
          </div>
        ) : job.status === "completed" ? (
          <div style={{ display: "flex", gap: 16, textAlign: "right" }}>
            <div>
              <div style={{ fontSize: 8, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>RETURN</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-jb)", fontWeight: 700, color: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" }}>{pct(job.total_return)}</div>
            </div>
            <div>
              <div style={{ fontSize: 8, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>SHARPE</div>
              <div style={{ fontSize: 11, fontFamily: "var(--font-jb)", fontWeight: 700, color: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--dim)" }}>{fmt(job.sharpe_ratio)}</div>
            </div>
          </div>
        ) : (
          <StatusBadge status={job.status} />
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 6 }}>
          {(isActive || isStale) && (
            <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{ fontSize: 9, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--bear)40", color: "var(--bear)", padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              cancel
            </button>
          )}
          {(job.status === "failed" || job.status === "cancelled") && (
            <button onClick={(e) => { e.stopPropagation(); onResume(); }} style={{ fontSize: 9, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--brand)40", color: "var(--brand)", padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              resume
            </button>
          )}
          {job.status === "completed" && (
            <span style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", cursor: "pointer" }}>
              {showLogs ? "▴" : "▾"}
            </span>
          )}
        </div>
      </div>

      {showLogs && <div style={{ padding: "0 16px 16px" }}><JobLogsPanel job={job} onClose={() => setShowLogs(false)} /></div>}
    </div>
  );
}

// ── New experiment creation ────────────────────────────────────────────────────

function CreateExperimentSection({ type, title, subtitle, onCreated }: {
  type: "philosophy" | "threshold" | "single";
  title: string;
  subtitle: string;
  onCreated: () => void;
}) {
  const [open, setOpen]               = useState(false);
  const [startDate, setStartDate]     = useState(DEFAULT_START);
  const [endDate, setEndDate]         = useState(DEFAULT_END);
  const [tickers, setTickers]         = useState(DEFAULT_TICKERS);
  const [ebcMode, setEbcMode]         = useState("autonomous");
  const [confThreshold, setConf]      = useState(0.65);
  const [philosophy, setPhilosophy]   = useState("balanced");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const days = tradingDayEst(startDate, endDate);
  const variantCount = type === "philosophy" ? PHILOSOPHIES.length : type === "threshold" ? THRESHOLDS.length : 1;
  const calls = days * tickerList.length * variantCount;

  // Friendly name auto-generated
  const autoName =
    type === "philosophy"
      ? `Philosophy Comparison · ${tickerList.join(",")} · ${startDate}–${endDate}`
      : type === "threshold"
      ? `Threshold Comparison · ${tickerList.join(",")} · ${startDate}–${endDate}`
      : `Single Run · ${tickerList.join(",")} · ${startDate}–${endDate}`;

  async function handleSubmit() {
    setSubmitting(true); setError(null);

    const body = {
      experiment_type: type,
      name: autoName,
      tickers: tickerList,
      start_date: startDate,
      end_date: endDate,
      ebc_mode: ebcMode,
      philosophy_mode: philosophy,
      confidence_threshold: type === "philosophy" ? confThreshold : type === "single" ? confThreshold : null,
    };

    const res = await fetchWithAuth(`${API}/v1/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res?.ok) {
      const detail = await res?.json().catch(() => ({}));
      setError(detail?.detail ?? "Failed to launch experiment.");
    } else {
      setSuccess(true);
      setTimeout(() => { setSuccess(false); setOpen(false); onCreated(); }, 1500);
    }
    setSubmitting(false);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>+ {title}</div>
          <div style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--ghost)" }}>{subtitle}</div>
        </div>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 12, color: "var(--ghost)" }}>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div style={{ padding: "4px 18px 20px", borderTop: "1px solid var(--line)" }} className="bcv-fade-in">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, paddingTop: 18, marginBottom: 16 }}>
            <Field label="TICKERS" hint="comma-separated">
              <input value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="AAPL, MSFT, TSLA" style={inputStyle} />
            </Field>
            <Field label="START DATE">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="END DATE">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="EBC MODE">
              <div style={{ display: "flex", gap: 6 }}>
                {EBC_MODES.map((m) => (
                  <button key={m} type="button" onClick={() => setEbcMode(m)} style={{
                    flex: 1, padding: "7px 8px", borderRadius: 6, fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: ebcMode === m ? 700 : 400,
                    border: `1px solid ${ebcMode === m ? modeColor[m] : "var(--line)"}`, color: ebcMode === m ? modeColor[m] : "var(--ghost)",
                    background: ebcMode === m ? `${modeColor[m]}12` : "transparent", cursor: "pointer",
                  }}>{m}</button>
                ))}
              </div>
            </Field>

            {/* Philosophy fixed param — show for threshold + single experiments */}
            {(type === "threshold" || type === "single") && (
              <Field label="PHILOSOPHY">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PHILOSOPHIES.map((p) => (
                    <button key={p} type="button" onClick={() => setPhilosophy(p)} style={{
                      flex: "1 1 auto", padding: "7px 4px", borderRadius: 6, fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: philosophy === p ? 700 : 400,
                      border: `1px solid ${philosophy === p ? (philosophyColors[p] ?? "var(--brand)") : "var(--line)"}`,
                      color: philosophy === p ? (philosophyColors[p] ?? "var(--brand)") : "var(--ghost)",
                      background: philosophy === p ? `${philosophyColors[p] ?? "var(--brand)"}12` : "transparent", cursor: "pointer",
                    }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  ))}
                </div>
              </Field>
            )}

            {/* Confidence threshold fixed param — show for philosophy + single experiments */}
            {(type === "philosophy" || type === "single") && (
              <Field label={type === "philosophy" ? "CONFIDENCE THRESHOLD (fixed)" : "CONFIDENCE THRESHOLD"}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {THRESHOLDS.map((t) => (
                    <button key={t} type="button" onClick={() => setConf(t)} style={{
                      flex: "1 1 auto", padding: "7px 4px", borderRadius: 6, fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: confThreshold === t ? 700 : 400,
                      border: `1px solid ${confThreshold === t ? "var(--brand)" : "var(--line)"}`,
                      color: confThreshold === t ? "var(--brand)" : "var(--ghost)",
                      background: confThreshold === t ? "var(--brand-bg)" : "transparent", cursor: "pointer",
                    }}>{(t * 100).toFixed(0)}%</button>
                  ))}
                </div>
              </Field>
            )}
          </div>

          <div style={{ background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-nunito)", color: "var(--dim)", marginBottom: 14 }}>
            {variantCount} variant{variantCount > 1 ? "s" : ""} × {days} days × {tickerList.length} tickers = ~{calls} AI calls
          </div>

          {error && (
            <div style={{ color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)", background: "var(--bear-bg)", border: "1px solid var(--bear)", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || success}
            style={{
              background: success ? "var(--bull)" : submitting ? "var(--line)" : "var(--brand)", color: "#fff",
              fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 14,
              padding: "11px 0", borderRadius: 8, border: "none", width: "100%",
              cursor: submitting || success ? "not-allowed" : "pointer", transition: "background 0.2s",
            }}
          >
            {success ? "✓ Launched" : submitting ? "Launching…" : `Run ${title} (${variantCount} backtest${variantCount > 1 ? "s" : ""})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BacktestComparisonView() {
  const [tab, setTab]                         = useState<PageTab>("experiments");
  const [allJobs, setAllJobs]                 = useState<BacktestJob[]>([]);
  const [experiments, setExperiments]         = useState<Experiment[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [cancellingStale, setCancellingStale] = useState(false);

  const loadAll = useCallback(async () => {
    // Fetch backend experiments + all jobs in parallel
    const [expRes, jobsRes] = await Promise.all([
      fetchWithAuth(`${API}/v1/experiments`),
      fetchWithAuth(`${API}/v1/backtest`),
    ]);

    const backendExps: BackendExperiment[] = expRes?.ok ? await expRes.json() : [];
    const jobs: BacktestJob[]              = jobsRes?.ok ? await jobsRes.json() : [];

    setAllJobs(jobs);

    // Convert backend experiments to display format
    const backedIds = new Set(backendExps.map((e) => e.id));
    const beDisplayed = backendExps.map(backendToExperiment);

    // Group orphan jobs (no experiment_id, or experiment_id not in backend list)
    const orphanJobs = jobs.filter((j) => !j.experiment_id || !backedIds.has(j.experiment_id));
    const orphanGroups = groupOrphanJobs(orphanJobs);

    // Merge: backend experiments first (newest), then orphan groups
    setExperiments([...beDisplayed, ...orphanGroups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  }, []);

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // Poll every 5s while any active jobs exist
  useEffect(() => {
    const hasActive = allJobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasActive) return;
    const id = setInterval(loadAll, 5000);
    return () => clearInterval(id);
  }, [allJobs, loadAll]);

  // Cancel all stale jobs (running > 24h)
  async function cancelAllStale() {
    setCancellingStale(true);
    const stale = allJobs.filter(
      (j) => (j.status === "running" || j.status === "queued") && Date.now() - new Date(j.created_at).getTime() > STALE_MS
    );
    await Promise.allSettled(
      stale.map((j) => fetchWithAuth(`${API}/v1/backtest/${j.id}/cancel`, { method: "POST" }))
    );
    await loadAll();
    setCancellingStale(false);
  }

  const activeCount    = allJobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const completedCount = allJobs.filter((j) => j.status === "completed").length;
  const staleCount     = allJobs.filter(
    (j) => (j.status === "running" || j.status === "queued") && Date.now() - new Date(j.created_at).getTime() > STALE_MS
  ).length;

  // Jobs tab: sort all jobs newest first
  const sortedJobs = [...allJobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  async function cancelJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/cancel`, { method: "POST" });
    await loadAll();
  }
  async function resumeJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/resume`, { method: "POST" });
    await loadAll();
  }

  return (
    <>
      <StyleInjector />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 32 }}>

        {/* Tab bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)" }}>
            {(["experiments", "jobs"] as PageTab[]).map((t) => (
              <button
                key={t}
                className="bcv-tab"
                onClick={() => setTab(t)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  padding: "8px 16px",
                  color: tab === t ? "var(--ink)" : "var(--ghost)",
                  borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent",
                  marginBottom: -2,
                }}
              >
                {t === "experiments" ? `Experiments${experiments.length > 0 ? ` (${experiments.length})` : ""}` : `Jobs${allJobs.length > 0 ? ` (${allJobs.length})` : ""}`}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {staleCount > 0 && (
              <button
                onClick={cancelAllStale}
                disabled={cancellingStale}
                style={{ fontSize: 10, fontFamily: "var(--font-jb)", background: "var(--bear-bg)", border: "1px solid var(--bear)40", color: "var(--bear)", padding: "4px 10px", borderRadius: 5, cursor: "pointer" }}
              >
                {cancellingStale ? "Cancelling…" : `Cancel ${staleCount} stale`}
              </button>
            )}
            <div style={{ fontSize: 11, fontFamily: "var(--font-nunito)", color: "var(--dim)" }}>
              {activeCount > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 10 }}>
                  <PulsingDot /> <span style={{ color: "var(--hold)" }}>{activeCount} running</span>
                </span>
              )}
              {completedCount > 0 && <span><span style={{ color: "var(--bull)" }}>{completedCount}</span> done</span>}
            </div>
            <button
              onClick={loadAll}
              style={{ fontSize: 11, fontFamily: "var(--font-jb)", background: "none", border: "1px solid var(--line)", color: "var(--ghost)", padding: "4px 10px", borderRadius: 5, cursor: "pointer" }}
            >
              ↺ Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "32px 0" }}>
            Loading…
          </div>
        )}

        {/* ── EXPERIMENTS TAB ── */}
        {!loading && tab === "experiments" && (
          <>
            {experiments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 24px", color: "var(--ghost)", fontFamily: "var(--font-nunito)", fontSize: 13 }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>◈</div>
                <div style={{ fontWeight: 600, color: "var(--dim)", marginBottom: 6 }}>No experiments yet</div>
                <div>Use the forms below to launch a philosophy or threshold comparison.</div>
              </div>
            ) : (
              experiments.map((exp, i) => (
                <ExperimentCard
                  key={exp.id}
                  experiment={exp}
                  defaultOpen={i === 0}
                  onJobsChanged={loadAll}
                />
              ))
            )}

            {/* Launch section */}
            <div style={{ borderTop: "1px solid var(--line)", margin: "8px 0", paddingTop: 12 }}>
              <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                Launch New Experiment
              </div>
            </div>
            <CreateExperimentSection
              type="philosophy"
              title="Philosophy Comparison"
              subtitle="Run Lynch · Soros · Buffett · Balanced with the same settings"
              onCreated={loadAll}
            />
            <CreateExperimentSection
              type="threshold"
              title="Confidence Threshold Comparison"
              subtitle="Run 50% · 65% · 80% · 95% confidence thresholds with the same settings"
              onCreated={loadAll}
            />
            <CreateExperimentSection
              type="single"
              title="Single Run"
              subtitle="Run one backtest with custom settings"
              onCreated={loadAll}
            />
          </>
        )}

        {/* ── JOBS TAB ── */}
        {!loading && tab === "jobs" && (
          <>
            {sortedJobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 24px", color: "var(--ghost)", fontFamily: "var(--font-nunito)", fontSize: 13 }}>
                No jobs yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sortedJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onCancel={() => cancelJob(job.id)}
                    onResume={() => resumeJob(job.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
