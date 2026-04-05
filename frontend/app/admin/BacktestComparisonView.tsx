"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

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
  confidence: number;
  reasoning?: string;
  executed: boolean;
  simulated_price: number | null;
  pnl: number | null;
  skipped_reason: string | null;
  trace_id: string | null;
};

type BacktestRequest = {
  tickers: string[];
  start_date: string;
  end_date: string;
  ebc_mode: string;
  philosophy_mode?: string;
  confidence_threshold?: number;
};

type ExperimentRun = {
  label: string;
  job: BacktestJob | null;
  submitting: boolean;
  error: string | null;
};

type ExperimentType = "philosophy" | "threshold";

// ── Constants ─────────────────────────────────────────────────────────────────

const PHILOSOPHIES = ["Lynch", "Soros", "Buffett", "Balanced"] as const;
const THRESHOLDS = [0.50, 0.65, 0.80, 0.95] as const;
const EBC_MODES = ["advisory", "autonomous"] as const;

const DEFAULT_START = "2026-03-03";
const DEFAULT_END   = "2026-03-31";
const DEFAULT_TICKERS = "AAPL, MSFT, TSLA, NVDA, META";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : n.toFixed(decimals);

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(2)}%`;

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

// ── Shared animations ─────────────────────────────────────────────────────────

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
.bcv-fade-in { animation: bcv-fade-in 0.3s ease both; }
.bcv-shimmer-bar {
  background: linear-gradient(90deg, var(--hold) 0%, #f5c542 40%, var(--hold) 100%);
  background-size: 200% 100%;
  animation: bcv-shimmer 1.8s linear infinite;
}
`;

function StyleInjector() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
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
      <span style={{
        position: "absolute", width: 10, height: 10, borderRadius: "50%",
        background: color, opacity: 0.4,
        animation: "bcv-pulse-ring 1.4s ease-out infinite",
      }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, position: "relative" }} />
    </span>
  );
}

function ProgressBar({ progress, running }: { progress: number; running: boolean }) {
  return (
    <div style={{ background: "var(--elevated)", borderRadius: 4, height: 4, overflow: "hidden", position: "relative" }}>
      <div
        className={running ? "bcv-shimmer-bar" : ""}
        style={{
          width: `${progress}%`,
          height: "100%",
          borderRadius: 4,
          background: running ? undefined : "var(--bull)",
          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const color =
    action === "BUY"   ? "var(--bull)"  :
    action === "SELL"  ? "var(--bear)"  :
    action === "ERROR" ? "var(--bear)"  :
    "var(--hold)";
  const bg =
    action === "BUY"   ? "var(--bull-bg)"  :
    action === "SELL"  ? "var(--bear-bg)"  :
    action === "ERROR" ? "var(--bear-bg)"  :
    "var(--hold-bg)";
  return (
    <span style={{
      fontFamily: "var(--font-jb)", fontSize: 10, fontWeight: 700,
      padding: "2px 6px", borderRadius: 3, color, background: bg, flexShrink: 0,
    }}>
      {action}
    </span>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 6 }}>
        {label}
        {hint && <span style={{ marginLeft: 8, opacity: 0.6 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink)", fontFamily: "var(--font-nunito)", fontSize: 13,
  boxSizing: "border-box",
};

// ── Job mini-card ─────────────────────────────────────────────────────────────

function JobMiniCard({ label, run }: { label: string; run: ExperimentRun }) {
  if (run.submitting) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 6 }}>{label}</div>
        <div style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>Submitting…</div>
      </div>
    );
  }

  if (run.error) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--bear)40", borderRadius: 8, padding: "10px 12px" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>{label}</div>
        <div style={{ color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>{run.error}</div>
      </div>
    );
  }

  if (!run.job) {
    return (
      <div style={{ background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", opacity: 0.5 }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>{label}</div>
      </div>
    );
  }

  const { job } = run;
  const isActive = job.status === "running" || job.status === "queued";

  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${isActive ? "var(--hold)40" : "var(--line)"}`,
      borderRadius: 8,
      padding: "10px 12px",
    }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>{label}</span>
        <div className="flex items-center gap-1.5">
          {isActive && <PulsingDot />}
          <span style={{
            fontSize: 9, fontFamily: "var(--font-jb)", color: statusColor[job.status],
            padding: "1px 6px", borderRadius: 3,
            background: `${statusColor[job.status]}15`,
            border: `1px solid ${statusColor[job.status]}30`,
          }}>
            {job.status}
          </span>
        </div>
      </div>
      {isActive && (
        <>
          <ProgressBar progress={job.progress} running={job.status === "running"} />
          <div style={{ marginTop: 4, fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
            {job.status === "queued" ? "queued" : `${job.progress}%`}
          </div>
        </>
      )}
      {job.status === "completed" && (
        <div className="flex gap-3">
          {[
            { label: "RTN", value: pct(job.total_return), pos: (job.total_return ?? 0) >= 0 },
            { label: "SHP", value: fmt(job.sharpe_ratio), pos: (job.sharpe_ratio ?? 0) >= 1 },
            { label: "DD",  value: pct(job.max_drawdown), pos: false },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-jb)", marginBottom: 1 }}>{m.label}</div>
              <div style={{
                color: m.label === "DD" ? "var(--bear)" : m.pos ? "var(--bull)" : "var(--bear)",
                fontSize: 12, fontFamily: "var(--font-jb)", fontWeight: 700,
              }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}
      {job.status === "failed" && job.error_message && (
        <div style={{ fontSize: 11, color: "var(--bear)", fontFamily: "var(--font-nunito)" }}>{job.error_message}</div>
      )}
    </div>
  );
}

// ── Trace panel ───────────────────────────────────────────────────────────────

function TracePanel({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [job, setJob] = useState<BacktestJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWithAuth(`${API}/v1/backtest/${jobId}`)
      .then(async (res) => {
        if (!res || !res.ok) { setError("Failed to load traces"); return; }
        setJob(await res.json());
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [jobId]);

  return (
    <div className="bcv-fade-in" style={{
      background: "var(--deep)",
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: "16px 18px",
      marginTop: 4,
    }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Daily Traces
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
        >
          ×
        </button>
      </div>

      {loading && (
        <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)", textAlign: "center", padding: "16px 0" }}>
          Loading traces…
        </div>
      )}
      {error && (
        <div style={{ color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>{error}</div>
      )}
      {!loading && !error && job && (
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {(!job.results?.daily_runs || job.results.daily_runs.length === 0) && (
            <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "16px 0" }}>
              No daily runs available.
            </div>
          )}
          {job.results?.daily_runs && job.results.daily_runs.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--font-jb)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  {["Date", "Ticker", "Action", "Conf", "Executed", "PnL"].map((h) => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {job.results.daily_runs.map((dr, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)", opacity: dr.executed ? 1 : 0.55 }}>
                    <td style={{ padding: "6px 10px", color: "var(--dim)", whiteSpace: "nowrap" }}>{dr.date}</td>
                    <td style={{ padding: "6px 10px", color: "var(--ink)", fontWeight: 700 }}>{dr.ticker}</td>
                    <td style={{ padding: "6px 10px" }}><ActionBadge action={dr.action} /></td>
                    <td style={{ padding: "6px 10px", color: "var(--dim)" }}>{(dr.confidence * 100).toFixed(0)}%</td>
                    <td style={{ padding: "6px 10px" }}>
                      <span style={{ color: dr.executed ? "var(--bull)" : "var(--ghost)", fontSize: 10 }}>
                        {dr.executed ? "✓" : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px", color: dr.pnl == null ? "var(--ghost)" : dr.pnl >= 0 ? "var(--bull)" : "var(--bear)" }}>
                      {dr.pnl == null ? "—" : `${dr.pnl >= 0 ? "+" : ""}${dr.pnl.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Results comparison table ──────────────────────────────────────────────────

function ComparisonTable({
  runs,
  labelKey,
}: {
  runs: ExperimentRun[];
  labelKey: "philosophy" | "threshold";
}) {
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);

  const completed = runs.filter((r) => r.job?.status === "completed");
  if (completed.length === 0) return null;

  const sorted = [...completed].sort((a, b) => {
    const sa = a.job?.sharpe_ratio ?? -Infinity;
    const sb = b.job?.sharpe_ratio ?? -Infinity;
    return sb - sa;
  });

  const bestId  = sorted[0]?.job?.id;
  const worstId = sorted[sorted.length - 1]?.job?.id;

  return (
    <div className="bcv-fade-in" style={{ marginTop: 20 }}>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
        Comparison — sorted by Sharpe ↓
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-jb)" }}>
          <thead>
            <tr style={{ background: "var(--elevated)", borderBottom: "1px solid var(--line)" }}>
              {[labelKey === "philosophy" ? "Philosophy" : "Threshold", "Cum. Return", "Sharpe", "Max Drawdown", "Win Rate", "Trades", "Signal→Exec", "Dir. Accuracy", ""].map((h) => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "var(--ghost)", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((run) => {
              const { job } = run;
              if (!job) return null;
              const isBest  = job.id === bestId;
              const isWorst = job.id === worstId && sorted.length > 1;
              const rowBg   = isBest ? "color-mix(in srgb, var(--bull) 8%, transparent)" :
                              isWorst ? "color-mix(in srgb, var(--bear) 8%, transparent)" :
                              "transparent";
              return (
                <React.Fragment key={job.id}>
                  <tr
                    style={{
                      borderBottom: openTraceId === job.id ? "none" : "1px solid var(--line)",
                      background: rowBg,
                    }}
                  >
                    <td style={{ padding: "10px 12px", color: "var(--ink)", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {isBest && <span style={{ color: "var(--bull)", marginRight: 6, fontSize: 10 }}>▲</span>}
                      {isWorst && <span style={{ color: "var(--bear)", marginRight: 6, fontSize: 10 }}>▼</span>}
                      {run.label}
                    </td>
                    <td style={{ padding: "10px 12px", color: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" }}>
                      {pct(job.total_return)}
                    </td>
                    <td style={{ padding: "10px 12px", color: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--dim)" }}>
                      {fmt(job.sharpe_ratio)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--bear)" }}>
                      {pct(job.max_drawdown)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--dim)" }}>
                      {pct(job.win_rate)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--dim)" }}>
                      {job.total_trades ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--dim)" }}>
                      {pct(job.signal_to_execution_rate)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--dim)" }}>
                      {pct(job.directional_accuracy)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        onClick={() => setOpenTraceId(openTraceId === job.id ? null : job.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--line)",
                          borderRadius: 5,
                          padding: "4px 10px",
                          color: "var(--ghost)",
                          fontSize: 11,
                          fontFamily: "var(--font-jb)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {openTraceId === job.id ? "Close" : "View Traces"}
                      </button>
                    </td>
                  </tr>
                  {openTraceId === job.id && (
                    <tr style={{ borderBottom: "1px solid var(--line)", background: rowBg }}>
                      <td colSpan={9} style={{ padding: "0 12px 12px" }}>
                        <TracePanel jobId={job.id} onClose={() => setOpenTraceId(null)} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Experiment section ────────────────────────────────────────────────────────

function ExperimentSection({
  title,
  subtitle,
  type,
  defaultOpen,
}: {
  title: string;
  subtitle: string;
  type: ExperimentType;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  // Config state
  const [startDate, setStartDate]     = useState(DEFAULT_START);
  const [endDate, setEndDate]         = useState(DEFAULT_END);
  const [tickers, setTickers]         = useState(DEFAULT_TICKERS);
  const [ebcMode, setEbcMode]         = useState<string>("autonomous");
  const [philosophy, setPhilosophy]   = useState<string>("Balanced");
  const [confThreshold, setConfThreshold] = useState<number>(0.65);

  // Run state — 4 runs
  const [runs, setRuns] = useState<ExperimentRun[]>([]);
  const [launched, setLaunched] = useState(false);

  const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  const runLabels: string[] = type === "philosophy"
    ? [...PHILOSOPHIES]
    : THRESHOLDS.map((t) => `${(t * 100).toFixed(0)}%`);

  // Poll while any runs are active
  useEffect(() => {
    if (!launched || runs.length === 0) return;
    const hasActive = runs.some((r) => r.job?.status === "running" || r.job?.status === "queued");
    if (!hasActive) return;

    const id = setInterval(async () => {
      const updated = await Promise.all(
        runs.map(async (r) => {
          if (!r.job || r.job.status === "completed" || r.job.status === "failed" || r.job.status === "cancelled") {
            return r;
          }
          const res = await fetchWithAuth(`${API}/v1/backtest/${r.job.id}`);
          if (!res || !res.ok) return r;
          const fresh: BacktestJob = await res.json();
          return { ...r, job: fresh };
        })
      );
      setRuns(updated);
    }, 5000);

    return () => clearInterval(id);
  }, [launched, runs]);

  async function handleRunExperiment() {
    setLaunched(true);
    const initial: ExperimentRun[] = runLabels.map((label) => ({
      label,
      job: null,
      submitting: true,
      error: null,
    }));
    setRuns(initial);

    const requests: BacktestRequest[] = type === "philosophy"
      ? PHILOSOPHIES.map((p) => ({
          tickers: tickerList,
          start_date: startDate,
          end_date: endDate,
          ebc_mode: ebcMode,
          philosophy_mode: p.toLowerCase(),
          confidence_threshold: confThreshold,
        }))
      : THRESHOLDS.map((t) => ({
          tickers: tickerList,
          start_date: startDate,
          end_date: endDate,
          ebc_mode: ebcMode,
          philosophy_mode: philosophy.toLowerCase(),
          confidence_threshold: t,
        }));

    const results = await Promise.all(
      requests.map(async (body, i) => {
        const res = await fetchWithAuth(`${API}/v1/backtest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res || !res.ok) {
          let errMsg = "Failed to start";
          try {
            const data = await res?.json();
            errMsg = data?.detail ?? errMsg;
          } catch { /* ignore parse error */ }
          return { label: runLabels[i], job: null, submitting: false, error: errMsg };
        }

        const job: BacktestJob = await res.json();
        return { label: runLabels[i], job, submitting: false, error: null };
      })
    );

    setRuns(results);
  }

  const allCompleted = runs.length > 0 && runs.every((r) => r.job?.status === "completed" || r.job?.status === "failed" || r.job?.status === "cancelled" || r.error != null);
  const anyRunning   = runs.some((r) => r.job?.status === "running" || r.job?.status === "queued" || r.submitting);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
      {/* Accordion header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px", background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>
            {title}
          </div>
          <div style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--ghost)" }}>
            {subtitle}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {anyRunning && <PulsingDot />}
          {allCompleted && runs.length > 0 && (
            <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--bull)", background: "var(--bull-bg)", padding: "2px 8px", borderRadius: 4 }}>
              done
            </span>
          )}
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 13, color: "var(--ghost)" }}>
            {open ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 18px 20px", borderTop: "1px solid var(--line)" }}>
          {/* Config grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 14,
              paddingTop: 18,
              marginBottom: 18,
            }}
          >
            <Field label="START DATE">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="END DATE">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="EBC MODE">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {EBC_MODES.map((m) => (
                  <button
                    key={m} type="button" onClick={() => setEbcMode(m)}
                    style={{
                      flex: "1 1 auto",
                      padding: "7px 8px", borderRadius: 6, textAlign: "center",
                      fontFamily: "var(--font-nunito)", fontSize: 12,
                      fontWeight: ebcMode === m ? 700 : 500,
                      border: `1px solid ${ebcMode === m ? modeColor[m] : "var(--line)"}`,
                      color: ebcMode === m ? modeColor[m] : "var(--ghost)",
                      background: ebcMode === m ? `${modeColor[m]}12` : "transparent",
                      cursor: "pointer", transition: "all 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="TICKERS" hint="comma-separated">
              <input
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                placeholder="AAPL, MSFT, TSLA, NVDA, META"
                style={inputStyle}
              />
            </Field>

            {/* Experiment-specific config */}
            {type === "philosophy" && (
              <Field label="CONFIDENCE THRESHOLD">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {THRESHOLDS.map((t) => (
                    <button
                      key={t} type="button" onClick={() => setConfThreshold(t)}
                      style={{
                        flex: "1 1 auto",
                        padding: "7px 8px", borderRadius: 6, textAlign: "center",
                        fontFamily: "var(--font-jb)", fontSize: 12,
                        fontWeight: confThreshold === t ? 700 : 500,
                        border: `1px solid ${confThreshold === t ? "var(--brand)" : "var(--line)"}`,
                        color: confThreshold === t ? "var(--brand)" : "var(--ghost)",
                        background: confThreshold === t ? "var(--brand)12" : "transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {(t * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {type === "threshold" && (
              <Field label="PHILOSOPHY">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PHILOSOPHIES.map((p) => (
                    <button
                      key={p} type="button" onClick={() => setPhilosophy(p)}
                      style={{
                        flex: "1 1 auto",
                        padding: "7px 8px", borderRadius: 6, textAlign: "center",
                        fontFamily: "var(--font-nunito)", fontSize: 12,
                        fontWeight: philosophy === p ? 700 : 500,
                        border: `1px solid ${philosophy === p ? "var(--brand)" : "var(--line)"}`,
                        color: philosophy === p ? "var(--brand)" : "var(--ghost)",
                        background: philosophy === p ? "var(--brand)12" : "transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>

          {/* Run labels description */}
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--elevated)", borderRadius: 8, border: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {type === "philosophy" ? "4 Runs:" : "4 Confidence Levels:"}
            </span>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 12, color: "var(--dim)", marginLeft: 10 }}>
              {runLabels.join("  ·  ")}
            </span>
          </div>

          {/* Run button */}
          <button
            onClick={handleRunExperiment}
            disabled={anyRunning}
            style={{
              background: anyRunning ? "var(--line)" : "var(--brand)",
              color: anyRunning ? "var(--ghost)" : "#fff",
              fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 13,
              padding: "10px 20px", borderRadius: 8, border: "none",
              cursor: anyRunning ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              marginBottom: launched ? 16 : 0,
            }}
          >
            {anyRunning ? "Running Experiment…" : launched ? "Re-run Experiment" : "Run Experiment"}
          </button>

          {/* Job mini-cards */}
          {launched && runs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 16 }}>
              {runs.map((run) => (
                <JobMiniCard key={run.label} label={run.label} run={run} />
              ))}
            </div>
          )}

          {/* Comparison table */}
          {allCompleted && (
            <ComparisonTable runs={runs} labelKey={type === "philosophy" ? "philosophy" : "threshold"} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BacktestComparisonView() {
  return (
    <>
      <StyleInjector />
      <div className="flex flex-col gap-4 pb-6">
        <div style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)", lineHeight: 1.6, padding: "4px 0 8px" }}>
          Run multi-philosophy or multi-threshold experiments in parallel and compare results side-by-side.
        </div>

        <ExperimentSection
          type="philosophy"
          title="Experiment A — Philosophy Comparison"
          subtitle="Compare Lynch, Soros, Buffett, and Balanced across the same date range"
          defaultOpen
        />

        <ExperimentSection
          type="threshold"
          title="Experiment B — Confidence Threshold Comparison"
          subtitle="Compare 50%, 65%, 80%, and 95% confidence thresholds for a fixed philosophy"
        />
      </div>
    </>
  );
}
