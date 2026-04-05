"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  portfolio_value_after?: number | null;
};

type BacktestJob = {
  id: string;
  status: string;
  tickers: string[];
  start_date: string;
  end_date: string;
  ebc_mode: string;
  philosophy_mode?: string | null;
  confidence_threshold?: number | null;
  initial_capital?: number | null;
  experiment_id?: string | null;
  results?: {
    daily_runs: DailyRun[];
    equity_curve: { date: string; value: number }[];
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const philosophyColors: Record<string, string> = {
  lynch:    "#6366f1",
  soros:    "#f59e0b",
  buffett:  "#10b981",
  balanced: "#3b82f6",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const PAGE_STYLES = `
@keyframes tr-fade {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tr-fade { animation: tr-fade 0.2s ease both; }
`;

function StyleInjector() {
  const ref = React.useRef(false);
  useEffect(() => {
    if (ref.current) return; ref.current = true;
    const el = document.createElement("style");
    el.textContent = PAGE_STYLES;
    document.head.appendChild(el);
  }, []);
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const conf = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n * 100)}%`;

function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "var(--bull)" : pct >= 65 ? "var(--hold)" : "var(--bear)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Confidence</span>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 13, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--elevated)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function ActionBanner({ action }: { action: string }) {
  const [color, bg, label] =
    action === "BUY"   ? ["var(--bull)",  "var(--bull-bg)",  "BUY"] :
    action === "SELL"  ? ["var(--bear)",  "var(--bear-bg)",  "SELL"] :
    action === "ERROR" ? ["var(--bear)",  "var(--bear-bg)",  "ERROR"] :
    ["var(--hold)", "var(--hold-bg)", "HOLD"];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: bg, border: `1px solid ${color}30`,
      borderRadius: 8, padding: "10px 20px",
    }}>
      <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 22, color }}>{label}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={handleCopy}
      style={{ fontFamily: "var(--font-jb)", fontSize: 10, background: "none", border: "1px solid var(--line)", color: copied ? "var(--bull)" : "var(--ghost)", padding: "2px 8px", borderRadius: 4, cursor: "pointer", flexShrink: 0 }}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

// ── Reasoning section ─────────────────────────────────────────────────────────

function ReasoningSection({ reasoning }: { reasoning: string }) {
  // Try to detect paragraph breaks and format them
  const paragraphs = reasoning.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {paragraphs.length > 1 ? paragraphs.map((p, i) => (
        <p key={i} style={{ margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)", lineHeight: 1.65 }}>{p}</p>
      )) : (
        <p style={{ margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)", lineHeight: 1.65 }}>{reasoning}</p>
      )}
    </div>
  );
}

// ── Pipeline stages (structural view of what the agent evaluated) ─────────────

function PipelineStage({
  icon,
  label,
  status,
  children,
}: {
  icon: string;
  label: string;
  status: "ok" | "warn" | "skip" | "error";
  children?: React.ReactNode;
}) {
  const statusColor =
    status === "ok"    ? "var(--bull)" :
    status === "warn"  ? "var(--hold)" :
    status === "error" ? "var(--bear)" :
    "var(--ghost)";
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `${statusColor}18`, border: `1px solid ${statusColor}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, flexShrink: 0,
        }}>{icon}</div>
        {children && <div style={{ width: 1, flex: 1, background: "var(--line)", marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: children ? 16 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: children ? 8 : 0 }}>
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-jb)", fontSize: 9, color: statusColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {status === "ok" ? "analyzed" : status === "warn" ? "flagged" : status === "error" ? "failed" : "n/a"}
          </span>
        </div>
        {children && <div style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>{children}</div>}
      </div>
    </div>
  );
}

function AgentPipeline({ run, ebc_mode }: { run: DailyRun; ebc_mode: string }) {
  const action = run.action;
  const conf = run.confidence ?? 0;
  const executed = run.executed;

  // Infer pipeline stages from available data
  const marketStage = { status: "ok" as const, note: `Market data retrieved for ${run.ticker} on ${run.date}` };
  const analysisStage = {
    status: action === "ERROR" ? "error" as const : "ok" as const,
    note: action === "ERROR" ? `Pipeline error: ${run.error}` : `Signal generated: ${action} at ${Math.round(conf * 100)}% confidence`,
  };
  const thresholdStage = {
    status: !executed && action !== "HOLD" && action !== "ERROR" ? "warn" as const : "ok" as const,
    note: run.skipped_reason
      ? `Skipped — ${run.skipped_reason}`
      : executed ? `Trade executed at $${run.simulated_price?.toFixed(2) ?? "—"}`
      : action === "HOLD" ? "HOLD — no trade required"
      : "Signal did not meet execution threshold",
  };
  const executionStage = {
    status: executed ? "ok" as const : "skip" as const,
    note: executed
      ? `Executed · price $${run.simulated_price?.toFixed(2) ?? "—"} · P&L ${run.pnl != null ? `${run.pnl >= 0 ? "+" : ""}$${run.pnl.toFixed(2)}` : "pending"}`
      : "Not executed",
  };

  return (
    <div style={{ background: "var(--elevated)", borderRadius: 8, padding: "16px 18px" }}>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
        Agent Pipeline · {ebc_mode}
      </div>
      <PipelineStage icon="⬡" label="Market Data" status={marketStage.status}>
        {marketStage.note}
      </PipelineStage>
      <PipelineStage icon="◈" label="Multi-Agent Analysis" status={analysisStage.status}>
        {analysisStage.note}
      </PipelineStage>
      <PipelineStage icon="◎" label="Threshold Filter" status={thresholdStage.status}>
        {thresholdStage.note}
      </PipelineStage>
      <PipelineStage icon="✦" label="Execution" status={executionStage.status}>
        {null}
      </PipelineStage>
      <div style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: executionStage.status === "ok" ? "var(--bull)" : "var(--ghost)", paddingLeft: 40, marginTop: -8 }}>
        {executionStage.note}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunTracePage() {
  const { id, date, ticker } = useParams<{ id: string; date: string; ticker: string }>();
  const router = useRouter();

  const [job, setJob]     = useState<BacktestJob | null>(null);
  const [run, setRun]     = useState<DailyRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API}/v1/backtest/${id}`)
      .then(async (res) => {
        if (!res?.ok) { setNotFound(true); return; }
        const j: BacktestJob = await res.json();
        setJob(j);
        const found = j.results?.daily_runs.find(
          (r) => r.date === date && r.ticker === ticker
        ) ?? null;
        if (!found) setNotFound(true);
        else setRun(found);
      })
      .finally(() => setLoading(false));
  }, [id, date, ticker]);

  const accent = job?.philosophy_mode ? (philosophyColors[job.philosophy_mode] ?? "#3b82f6") : "#3b82f6";

  return (
    <>
      <StyleInjector />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>

        {/* Back nav */}
        <button
          onClick={() => router.push(`/admin/jobs/${id}`)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontFamily: "var(--font-jb)", fontSize: 11, padding: 0, alignSelf: "flex-start" }}
        >
          ← Back to Job
        </button>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ghost)", fontFamily: "var(--font-nunito)" }}>Loading…</div>
        )}

        {notFound && !loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--bear)", fontFamily: "var(--font-nunito)" }}>
            Run not found — this signal may not have been recorded.
          </div>
        )}

        {!loading && run && job && (
          <div className="tr-fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Header */}
            <div style={{ background: "var(--surface)", border: `1px solid var(--line)`, borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-jb)", fontSize: 22, fontWeight: 700, color: accent, marginBottom: 4 }}>
                    {ticker}
                  </div>
                  <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>
                    {date} · {job.ebc_mode}
                    {job.philosophy_mode && ` · ${job.philosophy_mode}`}
                    {job.confidence_threshold != null && ` · ${Math.round(job.confidence_threshold * 100)}% threshold`}
                  </div>
                </div>
                <ActionBanner action={run.action} />
              </div>

              {/* Confidence bar */}
              {run.confidence != null && (
                <div style={{ marginTop: 20 }}>
                  <ConfidenceBar value={run.confidence} />
                </div>
              )}

              {/* Execution summary */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginTop: 16 }}>
                {[
                  { k: "Executed",  v: run.executed ? "Yes" : "No",  color: run.executed ? "var(--bull)" : "var(--ghost)" },
                  { k: "Price",     v: run.simulated_price != null ? `$${run.simulated_price.toFixed(2)}` : "—",  color: "var(--dim)" },
                  { k: "P&L",       v: run.pnl != null ? `${run.pnl >= 0 ? "+" : ""}$${run.pnl.toFixed(2)}` : "—",  color: run.pnl == null ? "var(--ghost)" : run.pnl >= 0 ? "var(--bull)" : "var(--bear)" },
                  { k: "Portfolio", v: run.portfolio_value_after != null ? `$${run.portfolio_value_after.toLocaleString()}` : "—",  color: "var(--dim)" },
                ].map((m) => (
                  <div key={m.k} style={{ background: "var(--elevated)", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{m.k}</div>
                    <div style={{ fontSize: 14, fontFamily: "var(--font-jb)", fontWeight: 700, color: m.color }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline view */}
            <AgentPipeline run={run} ebc_mode={job.ebc_mode} />

            {/* Reasoning */}
            {run.reasoning && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "18px 22px" }}>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  Synthesis Reasoning
                </div>
                <ReasoningSection reasoning={run.reasoning} />
              </div>
            )}

            {/* Skip reason */}
            {run.skipped_reason && !run.executed && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--hold)30", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--hold)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Skip Reason
                </div>
                <div style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
                  {run.skipped_reason}
                </div>
              </div>
            )}

            {/* Error */}
            {run.error && (
              <div style={{ background: "var(--bear-bg)", border: "1px solid var(--bear)30", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--bear)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Pipeline Error
                </div>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 12, color: "var(--bear)", lineHeight: 1.6 }}>
                  {run.error}
                </div>
              </div>
            )}

            {/* Trace ID */}
            {run.trace_id && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Trace
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <code style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--dim)", background: "var(--elevated)", padding: "6px 10px", borderRadius: 6, flex: 1, wordBreak: "break-all" }}>
                    {run.trace_id}
                  </code>
                  <CopyButton text={run.trace_id} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
