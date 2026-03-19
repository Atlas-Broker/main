"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "completed" | "failed";

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
  results?: BacktestResults;
};

type BacktestResults = {
  daily_runs: DailyRun[];
  equity_curve: { date: string; value: number }[];
  metrics: Record<string, unknown>;
};

type DailyRun = {
  date: string;
  ticker: string;
  action: string;
  confidence: number;
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
  advisory:    "var(--dim)",
  conditional: "var(--hold)",
  autonomous:  "var(--bull)",
};

const statusColor: Record<JobStatus, string> = {
  queued:    "var(--dim)",
  running:   "var(--hold)",
  completed: "var(--bull)",
  failed:    "var(--bear)",
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

// ── Main component ────────────────────────────────────────────────────────────

export function BacktestTab() {
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

  // Poll running jobs every 5s
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasRunning) return;
    const id = setInterval(loadJobs, 5000);
    return () => clearInterval(id);
  }, [jobs]);

  async function openDetail(job: BacktestJob) {
    const res = await fetchWithAuth(`${API}/v1/backtest/${job.id}`);
    if (!res) return;
    setSelected(await res.json());
    setView("detail");
  }

  if (view === "new") return <NewBacktestForm onBack={() => setView("list")} onCreated={() => { setView("list"); loadJobs(); }} />;
  if (view === "detail" && selected) return <ResultsDetail job={selected} onBack={() => setView("list")} />;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between">
        <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
          BACKTESTS — {jobs.length} RUNS
        </span>
        <button
          onClick={() => setView("new")}
          style={{
            background: "var(--brand)", color: "#fff",
            fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 13,
            padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
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
        <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "32px 0" }}>
          No backtests yet. Click &quot;+ New Backtest&quot; to run your first one.
        </div>
      )}

      {jobs.map((job) => (
        <div
          key={job.id}
          onClick={() => job.status === "completed" && openDetail(job)}
          style={{
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10,
            padding: "16px 18px", boxShadow: "var(--card-shadow)",
            cursor: job.status === "completed" ? "pointer" : "default",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                {job.tickers.join(" · ")}
              </span>
              <span style={{ marginLeft: 10, fontFamily: "var(--font-nunito)", fontSize: 12, color: modeColor[job.ebc_mode] }}>
                {job.ebc_mode}
              </span>
            </div>
            <span style={{ fontSize: 11, fontFamily: "var(--font-jb)", color: statusColor[job.status], padding: "2px 8px", borderRadius: 4, background: `${statusColor[job.status]}18`, border: `1px solid ${statusColor[job.status]}40` }}>
              {job.status}
            </span>
          </div>

          <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", marginBottom: 10 }}>
            {job.start_date} → {job.end_date}
          </div>

          {(job.status === "running" || job.status === "queued") && (
            <div style={{ background: "var(--elevated)", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${job.progress}%`, background: "var(--hold)", height: "100%", transition: "width 0.5s" }} />
            </div>
          )}

          {job.status === "completed" && (
            <div className="grid grid-cols-3 gap-2 text-center mt-1">
              {[
                { label: "RETURN",   value: pct(job.total_return) },
                { label: "SHARPE",   value: fmt(job.sharpe_ratio) },
                { label: "MAX DD",   value: pct(job.max_drawdown) },
              ].map((m) => (
                <div key={m.label}>
                  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>{m.label}</div>
                  <div style={{ color: "var(--ink)", fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── New Backtest Form ─────────────────────────────────────────────────────────

function NewBacktestForm({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [tickers, setTickers] = useState("AAPL, MSFT, TSLA");
  const [startDate, setStartDate] = useState("2025-10-01");
  const [endDate, setEndDate] = useState("2025-12-01");
  const [mode, setMode] = useState("conditional");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const days = tradingDayEstimate(startDate, endDate);
  const calls = days * tickerList.length;
  const costEst = (calls * 0.001).toFixed(2);

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
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 13 }}>← Back</button>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>NEW BACKTEST</span>
      </div>

      {[
        { label: "TICKERS", hint: "comma-separated, e.g. AAPL, MSFT, TSLA", node: <input value={tickers} onChange={(e) => setTickers(e.target.value)} style={inputStyle} /> },
        { label: "START DATE", node: <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /> },
        { label: "END DATE",   node: <input type="date" value={endDate}   onChange={(e) => setEndDate(e.target.value)}   style={inputStyle} /> },
      ].map(({ label, hint, node }) => (
        <div key={label}>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 6 }}>{label}{hint && <span style={{ marginLeft: 8, opacity: 0.6 }}>{hint}</span>}</div>
          {node}
        </div>
      ))}

      <div>
        <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 8 }}>EBC MODE</div>
        <div className="flex gap-2">
          {(["advisory", "conditional", "autonomous"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 6, textAlign: "center",
              fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: mode === m ? 700 : 500,
              border: `1px solid ${mode === m ? modeColor[m] : "var(--line)"}`,
              color: mode === m ? modeColor[m] : "var(--ghost)",
              background: mode === m ? `${modeColor[m]}10` : "transparent",
              cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)" }}>
        ~{calls} AI calls · approx. ${costEst} <span style={{ color: "var(--ghost)", fontSize: 11 }}>(estimate)</span>
      </div>

      {error && <div style={{ color: "var(--bear)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{error}</div>}

      <button type="submit" disabled={submitting} style={{
        background: submitting ? "var(--line)" : "var(--brand)", color: "#fff",
        fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 15,
        padding: "12px 0", borderRadius: 8, border: "none", cursor: submitting ? "not-allowed" : "pointer",
      }}>
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

// ── Results Detail ────────────────────────────────────────────────────────────

function ResultsDetail({ job, onBack }: { job: BacktestJob; onBack: () => void }) {
  const metrics = job.results?.metrics as Record<string, unknown> | undefined;
  const perTicker = (metrics?.per_ticker ?? {}) as Record<string, { return_contribution: number; trades: number }>;
  const dailyRuns = job.results?.daily_runs ?? [];

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 13 }}>← Back</button>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{job.tickers.join(" · ")}</span>
        <span style={{ fontSize: 11, color: modeColor[job.ebc_mode], fontFamily: "var(--font-nunito)" }}>{job.ebc_mode}</span>
      </div>

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          { label: "RETURN",      value: pct(job.total_return) },
          { label: "SHARPE",      value: fmt(job.sharpe_ratio) },
          { label: "MAX DD",      value: pct(job.max_drawdown) },
          { label: "WIN RATE",    value: pct(job.win_rate) },
          { label: "TRADES",      value: String(job.total_trades ?? "—") },
          { label: "SIG→EXEC",    value: pct(job.signal_to_execution_rate) },
        ].map((m) => (
          <div key={m.label} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Per-ticker breakdown */}
      {Object.keys(perTicker).length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>PER TICKER</span>
          </div>
          {Object.entries(perTicker).map(([ticker, data]) => (
            <div key={ticker} className="flex items-center justify-between" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)" }}>{ticker}</span>
              <span style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)" }}>{data.trades} trades</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: data.return_contribution >= 0 ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>
                {pct(data.return_contribution)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Daily runs */}
      {dailyRuns.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>DAILY RUNS — {dailyRuns.length}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {dailyRuns.map((r, i) => (
              <div key={i} className="flex items-center gap-3" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", opacity: r.executed ? 1 : 0.5 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ghost)", minWidth: 80 }}>{r.date}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--ink)", minWidth: 50 }}>{r.ticker}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                  color: r.action === "BUY" ? "var(--bull)" : r.action === "SELL" ? "var(--bear)" : "var(--hold)",
                  background: r.action === "BUY" ? "var(--bull-bg)" : r.action === "SELL" ? "var(--bear-bg)" : "var(--hold-bg)",
                }}>{r.action}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--dim)" }}>{Math.round(r.confidence * 100)}%</span>
                <span style={{ fontFamily: "var(--font-nunito)", fontSize: 11, color: r.executed ? "var(--bull)" : "var(--ghost)", marginLeft: "auto" }}>
                  {r.executed ? "✓ executed" : r.skipped_reason ?? "skipped"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
