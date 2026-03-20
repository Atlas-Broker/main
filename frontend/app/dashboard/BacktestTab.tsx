"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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

type View = "list" | "new" | "detail";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : n.toFixed(decimals);

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(2)}%`;

const modeColor: Record<string, string> = {
  advisory:             "var(--dim)",
  conditional:          "var(--hold)",
  autonomous_guardrail: "var(--brand)",
  autonomous:           "var(--bull)",
};

const statusColor: Record<JobStatus, string> = {
  queued:    "var(--dim)",
  running:   "var(--hold)",
  completed: "var(--bull)",
  failed:    "var(--bear)",
  cancelled: "var(--dim)",
};

function tradingDayEstimate(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  let days = 0, cur = new Date(s);
  while (cur <= e) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Shared animations (injected once) ─────────────────────────────────────────

const GLOBAL_STYLES = `
@keyframes bt-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes bt-pulse-ring {
  0%   { opacity: 0.7; transform: scale(1); }
  70%  { opacity: 0;   transform: scale(2.2); }
  100% { opacity: 0;   transform: scale(2.2); }
}
@keyframes bt-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes bt-dot-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
.bt-fade-row { animation: bt-fade-in 0.35s ease both; }
.bt-shimmer-bar {
  background: linear-gradient(90deg, var(--hold) 0%, #f5c542 40%, var(--hold) 100%);
  background-size: 200% 100%;
  animation: bt-shimmer 1.8s linear infinite;
}
.bt-running-card {
  animation: none;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.bt-running-card:hover { box-shadow: 0 0 0 1px var(--hold) !important; }
.bt-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important; }
`;

function StyleInjector() {
  const injected = useRef(false);
  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const el = document.createElement("style");
    el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
  }, []);
  return null;
}

// ── Running dot ───────────────────────────────────────────────────────────────

function PulsingDot({ color = "var(--hold)" }: { color?: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{
        position: "absolute", width: 10, height: 10, borderRadius: "50%",
        background: color, opacity: 0.4,
        animation: "bt-pulse-ring 1.4s ease-out infinite",
      }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, position: "relative" }} />
    </span>
  );
}

// ── Shimmer progress bar ───────────────────────────────────────────────────────

function ProgressBar({ progress, running }: { progress: number; running: boolean }) {
  return (
    <div style={{ background: "var(--elevated)", borderRadius: 4, height: 5, overflow: "hidden", position: "relative" }}>
      <div
        className={running ? "bt-shimmer-bar" : ""}
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

// ── Action badge ───────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export function BacktestTab({ role }: { role?: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [jobs, setJobs] = useState<BacktestJob[]>([]);
  const [selected, setSelected] = useState<BacktestJob | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);

  async function loadJobs() {
    const res = await fetchWithAuth(`${API}/v1/backtest`);
    if (!res) { router.push("/login"); return; }
    if (res.ok) setJobs(await res.json());
  }

  useEffect(() => {
    loadJobs().finally(() => setLoadingJobs(false));
  }, []);

  // Poll list every 5s when any job is active
  useEffect(() => {
    if (view !== "list") return;
    const hasActive = jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasActive) return;
    const id = setInterval(loadJobs, 5000);
    return () => clearInterval(id);
  }, [jobs, view]);

  async function openDetail(job: BacktestJob) {
    const res = await fetchWithAuth(`${API}/v1/backtest/${job.id}`);
    if (!res) return;
    setSelected(await res.json());
    setView("detail");
  }

  async function deleteJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}`, { method: "DELETE" });
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }

  async function cancelJob(jobId: string) {
    await fetchWithAuth(`${API}/v1/backtest/${jobId}/cancel`, { method: "POST" });
    await loadJobs();
  }

  if (view === "new") {
    return (
      <>
        <StyleInjector />
        <NewBacktestForm
          role={role}
          onBack={() => setView("list")}
          onCreated={() => { setView("list"); loadJobs(); }}
        />
      </>
    );
  }

  if (view === "detail" && selected) {
    return (
      <>
        <StyleInjector />
        <ResultsDetail
          initialJob={selected}
          onBack={() => { setView("list"); loadJobs(); }}
        />
      </>
    );
  }

  const runningCount = jobs.filter((j) => j.status === "running").length;

  return (
    <>
      <StyleInjector />
      <div className="flex flex-col gap-3 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
              BACKTESTS — {jobs.length} RUNS
            </span>
            {runningCount > 0 && (
              <div className="flex items-center gap-1.5">
                <PulsingDot />
                <span style={{ color: "var(--hold)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
                  {runningCount} running
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setView("new")}
            style={{
              background: "var(--brand)", color: "#fff",
              fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 13,
              padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer",
            }}
          >
            + New Backtest
          </button>
        </div>

        {loadingJobs && (
          <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "32px 0" }}>
            Loading…
          </div>
        )}

        {!loadingJobs && jobs.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            color: "var(--ghost)", fontFamily: "var(--font-nunito)", fontSize: 13,
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--dim)" }}>No backtests yet</div>
            <div style={{ fontSize: 12 }}>Run your first backtest to replay the AI pipeline on historical data.</div>
          </div>
        )}

        {jobs.map((job) => (
          <div
            key={job.id}
            className={`bt-card ${job.status === "running" ? "bt-running-card" : ""}`}
            onClick={() => openDetail(job)}
            style={{
              background: "var(--surface)",
              border: `1px solid ${job.status === "running" ? "var(--hold-bg)" : "var(--line)"}`,
              borderRadius: 10,
              padding: "14px 16px",
              cursor: "pointer",
              position: "relative",
              transition: "all 0.2s",
            }}
          >
            {/* Status row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {job.status === "running" && <PulsingDot />}
                <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                  {job.tickers.join(" · ")}
                </span>
                <span style={{ fontSize: 11, fontFamily: "var(--font-nunito)", color: modeColor[job.ebc_mode] }}>
                  {job.ebc_mode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{
                  fontSize: 10, fontFamily: "var(--font-jb)", color: statusColor[job.status],
                  padding: "2px 7px", borderRadius: 4,
                  background: `${statusColor[job.status]}15`,
                  border: `1px solid ${statusColor[job.status]}35`,
                }}>
                  {job.status}
                </span>
                {/* Cancel button — only for running/queued */}
                {(job.status === "running" || job.status === "queued") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
                    style={{
                      background: "none", border: "1px solid var(--bear)40", cursor: "pointer",
                      color: "var(--bear)", fontSize: 10, padding: "2px 7px", borderRadius: 4,
                      fontFamily: "var(--font-jb)",
                    }}
                    title="Cancel"
                  >cancel</button>
                )}
                {/* Delete button — only for non-running, non-queued */}
                {job.status !== "running" && job.status !== "queued" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                    title="Delete"
                  >×</button>
                )}
              </div>
            </div>

            {/* Date range */}
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>
              {job.start_date} → {job.end_date}
              <span style={{ marginLeft: 8, color: "var(--ghost)", opacity: 0.6 }}>
                {relTime(job.created_at)}
              </span>
            </div>

            {/* Progress bar */}
            {(job.status === "running" || job.status === "queued") && (
              <div>
                <ProgressBar progress={job.progress} running={job.status === "running"} />
                <div style={{ marginTop: 5, fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)" }}>
                  {job.status === "queued" ? "queued" : `${job.progress}% — click to watch live`}
                </div>
              </div>
            )}

            {/* Metrics summary (completed) */}
            {job.status === "completed" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 4 }}>
                {[
                  { label: "RETURN", value: pct(job.total_return), positive: (job.total_return ?? 0) >= 0 },
                  { label: "SHARPE", value: fmt(job.sharpe_ratio), positive: (job.sharpe_ratio ?? 0) >= 1 },
                  { label: "MAX DD", value: pct(job.max_drawdown), positive: false },
                ].map((m) => (
                  <div key={m.label} style={{ textAlign: "center" }}>
                    <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-jb)", marginBottom: 2 }}>{m.label}</div>
                    <div style={{
                      color: m.label === "MAX DD" ? "var(--bear)" : m.positive ? "var(--bull)" : "var(--bear)",
                      fontSize: 13, fontFamily: "var(--font-jb)", fontWeight: 700,
                    }}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Failed */}
            {job.status === "failed" && job.error_message && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-nunito)", color: "var(--bear)", marginTop: 4 }}>
                {job.error_message}
              </div>
            )}

            {/* Click arrow hint */}
            <span style={{
              position: "absolute", right: 14, bottom: 14,
              color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", opacity: 0.5,
            }}>→</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── New Backtest Form ─────────────────────────────────────────────────────────

function NewBacktestForm({
  onBack,
  onCreated,
  role,
}: {
  onBack: () => void;
  onCreated: () => void;
  role?: string;
}) {
  const router = useRouter();
  const [tickers, setTickers] = useState("AAPL, MSFT, TSLA");
  const [startDate, setStartDate] = useState("2025-11-17");
  const [endDate, setEndDate] = useState("2026-01-17");
  const [mode, setMode] = useState("advisory");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const days = tradingDayEstimate(startDate, endDate);
  const calls = days * tickerList.length;
  const costEst = (calls * 0.001).toFixed(2);

  const maxConcurrent =
    role === "superadmin" ? 10 : role === "admin" ? 5 : 1;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetchWithAuth(`${API}/v1/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers: tickerList, start_date: startDate, end_date: endDate, ebc_mode: mode }),
    });
    if (!res) { router.push("/login"); return; }
    if (!res.ok) {
      const data = await res.json();
      setError(data.detail ?? "Failed to start backtest");
      setSubmitting(false);
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 13, padding: 0 }}>
          ← Back
        </button>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>NEW BACKTEST</span>
        {(role === "admin" || role === "superadmin") && (
          <span style={{
            marginLeft: "auto", fontSize: 10, fontFamily: "var(--font-jb)",
            color: "var(--bull)", background: "var(--bull-bg)", padding: "2px 8px", borderRadius: 4,
          }}>
            up to {maxConcurrent} concurrent
          </span>
        )}
      </div>

      {[
        {
          label: "TICKERS",
          hint: "comma-separated",
          node: <input value={tickers} onChange={(e) => setTickers(e.target.value)} style={inputStyle} placeholder="AAPL, MSFT, TSLA" />,
        },
        {
          label: "START DATE",
          node: <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />,
        },
        {
          label: "END DATE",
          node: <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />,
        },
      ].map(({ label, hint, node }) => (
        <div key={label}>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 6 }}>
            {label}
            {hint && <span style={{ marginLeft: 8, opacity: 0.6 }}>{hint}</span>}
          </div>
          {node}
        </div>
      ))}

      <div>
        <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 8 }}>EBC MODE</div>
        <div className="flex gap-2">
          {(["advisory", "autonomous_guardrail", "autonomous"] as const).map((m) => (
            <button
              key={m} type="button" onClick={() => setMode(m)}
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 6, textAlign: "center",
                fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: mode === m ? 700 : 500,
                border: `1px solid ${mode === m ? modeColor[m] : "var(--line)"}`,
                color: mode === m ? modeColor[m] : "var(--ghost)",
                background: mode === m ? `${modeColor[m]}12` : "transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {m === "autonomous_guardrail" ? "auto+guard" : m}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        background: "var(--elevated)", border: "1px solid var(--line)",
        borderRadius: 8, padding: "10px 14px",
        fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)",
      }}>
        ~{calls} AI calls · est. ${costEst}
        <span style={{ color: "var(--ghost)", fontSize: 11 }}> (Gemini)</span>
      </div>

      {error && (
        <div style={{
          color: "var(--bear)", fontSize: 13, fontFamily: "var(--font-nunito)",
          background: "var(--bear-bg)", border: "1px solid var(--bear)", borderRadius: 6, padding: "8px 12px",
        }}>
          {error}
        </div>
      )}

      <button
        type="submit" disabled={submitting}
        style={{
          background: submitting ? "var(--line)" : "var(--brand)", color: "#fff",
          fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 15,
          padding: "13px 0", borderRadius: 8, border: "none",
          cursor: submitting ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {submitting ? "Starting…" : "Run Backtest"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink)", fontFamily: "var(--font-nunito)", fontSize: 14,
  boxSizing: "border-box",
};

// ── Results / Live Detail ─────────────────────────────────────────────────────

function ResultsDetail({
  initialJob,
  onBack,
}: {
  initialJob: BacktestJob;
  onBack: () => void;
}) {
  const [job, setJob] = useState<BacktestJob>(initialJob);
  const [prevRunCount, setPrevRunCount] = useState(
    initialJob.results?.daily_runs?.length ?? 0
  );
  const feedRef = useRef<HTMLDivElement>(null);

  const isLive = job.status === "running" || job.status === "queued";

  // Poll every 2s while job is live
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(async () => {
      const res = await fetchWithAuth(`${API}/v1/backtest/${job.id}`);
      if (!res || !res.ok) return;
      const updated: BacktestJob = await res.json();
      setPrevRunCount((job.results?.daily_runs?.length ?? 0));
      setJob(updated);
    }, 2000);
    return () => clearInterval(id);
  }, [isLive, job.id]);

  // Auto-scroll feed to latest entry
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [job.results?.daily_runs?.length]);

  const metrics = job.results?.metrics as Record<string, unknown> | undefined;
  const perTicker = (metrics?.per_ticker ?? {}) as Record<string, { return_contribution: number; trades: number }>;
  const dailyRuns = job.results?.daily_runs ?? [];
  const totalDays = tradingDayEstimate(job.start_date, job.end_date);
  const daysProcessed = new Set(dailyRuns.map((r) => r.date)).size;
  const lastRun = dailyRuns[dailyRuns.length - 1];

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 13, padding: 0 }}
        >
          ← Back
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isLive && <PulsingDot />}
          <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
            {job.tickers.join(" · ")}
          </span>
          <span style={{ fontSize: 11, color: modeColor[job.ebc_mode], fontFamily: "var(--font-nunito)" }}>
            {job.ebc_mode}
          </span>
        </div>
        <span style={{
          fontSize: 10, fontFamily: "var(--font-jb)", color: statusColor[job.status],
          padding: "2px 7px", borderRadius: 4,
          background: `${statusColor[job.status]}15`,
          border: `1px solid ${statusColor[job.status]}35`,
        }}>
          {job.status}
        </span>
        {isLive && (
          <button
            onClick={async () => {
              await fetchWithAuth(`${API}/v1/backtest/${job.id}/cancel`, { method: "POST" });
              onBack();
            }}
            style={{
              background: "none", border: "1px solid var(--bear)40", cursor: "pointer",
              color: "var(--bear)", fontSize: 10, padding: "2px 7px", borderRadius: 4,
              fontFamily: "var(--font-jb)",
            }}
          >cancel</button>
        )}
      </div>

      {/* Live progress section */}
      {isLive && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--hold)", borderRadius: 10,
          padding: "14px 16px",
        }}>
          <div className="flex items-center justify-between mb-3">
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--hold)" }}>
              LIVE PROGRESS
            </span>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
              {daysProcessed} / ~{totalDays} days · {job.progress}%
            </span>
          </div>
          <ProgressBar progress={job.progress} running />
          {lastRun && (
            <div style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-nunito)", color: "var(--dim)" }}>
              <span style={{ fontFamily: "var(--font-jb)", color: "var(--ghost)", marginRight: 8 }}>{lastRun.date}</span>
              <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, color: "var(--ink)", marginRight: 8 }}>{lastRun.ticker}</span>
              <ActionBadge action={lastRun.action} />
              <span style={{ marginLeft: 8, color: "var(--ghost)" }}>{Math.round(lastRun.confidence * 100)}% confidence</span>
            </div>
          )}
        </div>
      )}

      {/* Live equity curve — updates as days complete */}
      {(isLive || job.status === "completed" || job.status === "cancelled") && (job.results?.equity_curve?.length ?? 0) >= 2 && (
        <EquityCurve points={job.results!.equity_curve} />
      )}

      {/* Live decision feed */}
      {isLive && dailyRuns.length > 0 && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--line)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
              AI DECISIONS — {dailyRuns.length}
            </span>
            <span style={{ animation: "bt-dot-blink 1.2s ease infinite", width: 5, height: 5, borderRadius: "50%", background: "var(--hold)", display: "inline-block" }} />
          </div>
          <div
            ref={feedRef}
            style={{ maxHeight: 340, overflowY: "auto", padding: "4px 0" }}
          >
            {[...dailyRuns].reverse().map((r, i) => {
              const isNew = i < (dailyRuns.length - prevRunCount);
              return (
                <div
                  key={`${r.date}-${r.ticker}`}
                  className={isNew ? "bt-fade-row" : ""}
                  style={{
                    padding: "9px 16px",
                    borderBottom: "1px solid var(--line)",
                    display: "flex", flexDirection: "column", gap: 3,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", minWidth: 78 }}>{r.date}</span>
                    <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 12, color: "var(--ink)", minWidth: 44 }}>{r.ticker}</span>
                    <ActionBadge action={r.action} />
                    <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--dim)", marginLeft: 2 }}>
                      {Math.round(r.confidence * 100)}%
                    </span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-nunito)", fontSize: 11, color: r.executed ? "var(--bull)" : "var(--ghost)" }}>
                      {r.executed ? "✓ exec" : r.skipped_reason ?? "skip"}
                    </span>
                  </div>
                  {r.reasoning && (
                    <div style={{
                      fontSize: 11, fontFamily: "var(--font-nunito)", color: "var(--ghost)",
                      paddingLeft: 80,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.reasoning}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed: metrics grid */}
      {job.status === "completed" && (() => {
        const m = job.results?.metrics as Record<string, unknown> | undefined;
        const cagr = m?.cagr as number | null | undefined;
        const calmar = m?.calmar_ratio as number | null | undefined;
        const pf = m?.profit_factor as number | null | undefined;

        const cells = [
          { label: "TOTAL RETURN",  value: pct(job.total_return),             color: (job.total_return ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" },
          { label: "CAGR",          value: pct(cagr),                         color: (cagr ?? 0) >= 0 ? "var(--bull)" : "var(--bear)" },
          { label: "SHARPE",        value: fmt(job.sharpe_ratio),              color: (job.sharpe_ratio ?? 0) >= 1 ? "var(--bull)" : "var(--hold)" },
          { label: "MAX DRAWDOWN",  value: pct(job.max_drawdown),             color: "var(--bear)" },
          { label: "CALMAR",        value: fmt(calmar),                        color: (calmar ?? 0) >= 1 ? "var(--bull)" : "var(--hold)" },
          { label: "PROFIT FACTOR", value: fmt(pf),                            color: (pf ?? 0) >= 1 ? "var(--bull)" : "var(--bear)" },
          { label: "WIN RATE",      value: pct(job.win_rate),                  color: (job.win_rate ?? 0) >= 0.5 ? "var(--bull)" : "var(--bear)" },
          { label: "TRADES",        value: String(job.total_trades ?? "—"),    color: "var(--dim)" },
          { label: "SIG→EXEC",      value: pct(job.signal_to_execution_rate), color: "var(--dim)" },
        ];

        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {cells.map((cell) => (
              <div key={cell.label} style={{
                background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: 8, padding: "10px 8px", textAlign: "center",
              }}>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 8, color: "var(--ghost)", marginBottom: 4, letterSpacing: "0.04em" }}>
                  {cell.label}
                </div>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 14, fontWeight: 700, color: cell.color }}>
                  {cell.value}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Per-ticker (completed) */}
      {job.status === "completed" && Object.keys(perTicker).length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>PER TICKER</span>
          </div>
          {Object.entries(perTicker).map(([ticker, data]) => (
            <div key={ticker} className="flex items-center gap-3" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, color: "var(--ink)", minWidth: 50 }}>{ticker}</span>
              <span style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--dim)" }}>{data.trades} trades</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-jb)", fontSize: 13, fontWeight: 600, color: data.return_contribution >= 0 ? "var(--bull)" : "var(--bear)" }}>
                {pct(data.return_contribution)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Daily runs (completed) */}
      {job.status === "completed" && dailyRuns.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
              ALL DECISIONS — {dailyRuns.length}
            </span>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {dailyRuns.map((r, i) => (
              <div key={i} style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", opacity: r.executed ? 1 : 0.55 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", minWidth: 78 }}>{r.date}</span>
                  <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 12, color: "var(--ink)", minWidth: 44 }}>{r.ticker}</span>
                  <ActionBadge action={r.action} />
                  <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--dim)" }}>{Math.round(r.confidence * 100)}%</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-nunito)", fontSize: 11, color: r.executed ? "var(--bull)" : "var(--ghost)" }}>
                    {r.executed ? "✓ exec" : r.skipped_reason ?? "skip"}
                  </span>
                </div>
                {r.reasoning && (
                  <div style={{ fontSize: 10, fontFamily: "var(--font-nunito)", color: "var(--ghost)", paddingLeft: 80, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.reasoning}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed */}
      {job.status === "failed" && (
        <div style={{
          background: "var(--bear-bg)", border: "1px solid var(--bear)",
          borderRadius: 8, padding: "12px 16px",
          fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--bear)",
        }}>
          {job.error_message ?? "Backtest failed. Check backend logs."}
        </div>
      )}

      {/* Cancelled */}
      {job.status === "cancelled" && (
        <div style={{
          background: "var(--elevated)", border: "1px solid var(--line)",
          borderRadius: 8, padding: "12px 16px",
          fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)",
        }}>
          Backtest was cancelled. {(job.results?.equity_curve?.length ?? 0)} days of data recorded.
        </div>
      )}
    </div>
  );
}

// ── Equity Curve ──────────────────────────────────────────────────────────────

function EquityCurve({ points, initialCapital = 10000 }: {
  points: { date: string; value: number; cash?: number }[];
  initialCapital?: number;
}) {
  if (points.length < 2) return null;

  const W = 320, H = 140, PAD_X = 48, PAD_TOP = 16, PAD_BOT = 24;
  const innerW = W - PAD_X;
  const innerH = H - PAD_TOP - PAD_BOT;

  const vals = points.map((p) => p.value);
  const allVals = [initialCapital, ...vals];
  const minV = Math.min(...allVals) * 0.995;
  const maxV = Math.max(...allVals) * 1.005;
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD_X + (innerW * i) / (points.length - 1);
  const toY = (v: number) => PAD_TOP + innerH * (1 - (v - minV) / range);

  const linePoints = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(" ");
  const fillPoints = `${toX(0)},${toY(minV)} ` + linePoints + ` ${toX(points.length - 1)},${toY(minV)}`;

  const baselineY = toY(initialCapital);
  const finalVal = vals[vals.length - 1];
  const positive = finalVal >= initialCapital;
  const color = positive ? "var(--bull)" : "var(--bear)";
  const colorHex = positive ? "#22c55e" : "#ef4444";

  // Y-axis labels (3 ticks)
  const yTicks = [minV, (minV + maxV) / 2, maxV].map((v) => ({
    y: toY(v),
    label: v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`,
  }));

  // Dot at last point
  const lastX = toX(points.length - 1);
  const lastY = toY(finalVal);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 16px" }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>EQUITY CURVE</span>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 12, fontWeight: 700, color }}>
          ${finalVal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorHex} stopOpacity="0.2" />
            <stop offset="100%" stopColor={colorHex} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis ticks */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_X} y1={t.y} x2={W} y2={t.y} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={PAD_X - 4} y={t.y + 3.5} textAnchor="end" fill="var(--ghost)" fontSize="8" fontFamily="var(--font-jb)">
              {t.label}
            </text>
          </g>
        ))}

        {/* Baseline at initial capital */}
        {baselineY > PAD_TOP && baselineY < H - PAD_BOT && (
          <line x1={PAD_X} y1={baselineY} x2={W} y2={baselineY} stroke="var(--ghost)" strokeWidth="0.75" strokeDasharray="4,4" opacity="0.5" />
        )}

        {/* Fill area */}
        <polygon points={fillPoints} fill="url(#eq-grad)" />

        {/* Main line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Terminal dot */}
        <circle cx={lastX} cy={lastY} r="3" fill={color} />
        <circle cx={lastX} cy={lastY} r="5" fill={color} opacity="0.2" />
      </svg>
      <div className="flex justify-between" style={{ marginTop: 2, fontFamily: "var(--font-jb)", fontSize: 9, color: "var(--ghost)" }}>
        <span>{points[0].date}</span>
        <span style={{ color: "var(--ghost)", fontSize: 9 }}>
          {positive ? "+" : ""}{(((finalVal - initialCapital) / initialCapital) * 100).toFixed(2)}%
        </span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}
