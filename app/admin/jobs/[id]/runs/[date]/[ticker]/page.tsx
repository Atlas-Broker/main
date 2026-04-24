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
  shares?: number | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const philosophyColors: Record<string, string> = {
  lynch:    "#6366f1",
  soros:    "#f59e0b",
  buffett:  "#10b981",
  balanced: "#3b82f6",
};

function actionStyle(action: string): { color: string; bg: string } {
  if (action === "BUY")   return { color: "#10b981", bg: "rgba(16,185,129,0.12)" };
  if (action === "SELL")  return { color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (action === "ERROR") return { color: "#ef4444", bg: "rgba(239,68,68,0.08)" };
  return { color: "#f59e0b", bg: "rgba(245,158,11,0.10)" };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
      style={{ fontFamily: "var(--font-jb)", fontSize: 10, background: "none", border: "1px solid var(--line)", color: copied ? "#10b981" : "var(--ghost)", padding: "3px 10px", borderRadius: 4, cursor: "pointer", flexShrink: 0 }}
    >
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

// ── Pipeline diagram ──────────────────────────────────────────────────────────

function Connector() {
  return (
    <div style={{ display: "flex", justifyContent: "center", height: 24, alignItems: "center" }}>
      <div style={{ width: 1, height: "100%", background: "var(--line)" }} />
    </div>
  );
}

function PipelineNode({
  label,
  sublabel,
  action,
  muted,
  wide,
}: {
  label: string;
  sublabel?: string;
  action?: string;
  muted?: boolean;
  wide?: boolean;
}) {
  const as = action ? actionStyle(action) : null;
  return (
    <div style={{
      border: `1px solid ${muted ? "var(--line)" : as ? `${as.color}40` : "var(--line)"}`,
      borderRadius: 8,
      padding: "10px 16px",
      background: as ? as.bg : "var(--elevated)",
      minWidth: wide ? 180 : 130,
      textAlign: "center",
      position: "relative",
    }}>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 12, fontWeight: 700, color: muted ? "var(--ghost)" : "var(--ink)" }}>{label}</div>
      {sublabel && <div style={{ fontFamily: "var(--font-nunito)", fontSize: 10, color: "var(--ghost)", marginTop: 2 }}>{sublabel}</div>}
      {action && (
        <div style={{
          display: "inline-block", marginTop: 6,
          fontFamily: "var(--font-jb)", fontSize: 10, fontWeight: 700,
          color: as!.color, background: `${as!.color}18`,
          border: `1px solid ${as!.color}30`,
          borderRadius: 4, padding: "1px 7px",
        }}>{action}</div>
      )}
    </div>
  );
}

function HorizontalConnector() {
  return <div style={{ width: 20, height: 1, background: "var(--line)", alignSelf: "center", flexShrink: 0 }} />;
}

function AgentPipelineDiagram({ run, ebc_mode }: { run: DailyRun; ebc_mode: string }) {
  const action = run.action;
  const conf = run.confidence ?? 0;
  const executed = run.executed;

  const analysisAction = action === "ERROR" ? "ERROR" : action;
  const thresholdNote = run.skipped_reason
    ? "SKIP"
    : executed ? action
    : action === "HOLD" ? "HOLD"
    : "SKIP";
  const execAction = executed ? action : undefined;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "24px 28px" }}>
      <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 20 }}>
        Agent Pipeline · {ebc_mode}
      </div>

      {/* Row 1: Fetch Data */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PipelineNode label="Fetch Data" sublabel={`${run.ticker} · ${run.date}`} wide />
      </div>

      <Connector />

      {/* Row 2: Sub-agents (Technical / Fundamental / Sentiment) */}
      <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        <PipelineNode label="Technical"    action={analysisAction} />
        <PipelineNode label="Fundamental"  action={analysisAction} />
        <PipelineNode label="Sentiment"    action={analysisAction} />
      </div>

      <Connector />

      {/* Row 3: Synthesis */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PipelineNode
          label="Synthesis"
          sublabel={`${Math.round(conf * 100)}% confidence`}
          action={analysisAction}
          wide
        />
      </div>

      <Connector />

      {/* Row 4: Risk */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PipelineNode label="Risk" sublabel="Position sizing" />
      </div>

      <Connector />

      {/* Row 5: Portfolio → EBC */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 0 }}>
        <PipelineNode label="Portfolio" action={thresholdNote} />
        <HorizontalConnector />
        <PipelineNode label="EBC" sublabel={ebc_mode} action={execAction} muted={!executed} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RunTracePage() {
  const { id, date, ticker } = useParams<{ id: string; date: string; ticker: string }>();
  const router = useRouter();

  const [job, setJob]         = useState<BacktestJob | null>(null);
  const [run, setRun]         = useState<DailyRun | null>(null);
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

  if (loading) return (
    <div style={{ textAlign: "center", padding: "80px 0", color: "var(--ghost)", fontFamily: "var(--font-nunito)" }}>Loading…</div>
  );
  if (notFound) return (
    <div style={{ textAlign: "center", padding: "80px 0", color: "#ef4444", fontFamily: "var(--font-nunito)" }}>
      Run not found — this signal may not have been recorded yet.
    </div>
  );
  if (!run || !job) return null;

  const as = actionStyle(run.action);
  const confPct = run.confidence != null ? Math.round(run.confidence * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>

      {/* Back nav */}
      <button
        onClick={() => router.push(`/admin/jobs/${id}`)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontFamily: "var(--font-jb)", fontSize: 11, padding: 0, alignSelf: "flex-start" }}
      >
        ← Back to Job
      </button>

      {/* Header */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--line)",
        borderTop: `3px solid ${accent}`,
        borderRadius: 10, padding: "20px 24px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 26, fontWeight: 700, color: accent, letterSpacing: "-0.01em" }}>
            {ticker}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>{date}</span>
            <span style={{ color: "var(--line)" }}>·</span>
            <span style={{
              fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--dim)",
              background: "var(--elevated)", border: "1px solid var(--line)",
              borderRadius: 4, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em",
            }}>{job.ebc_mode}</span>
            {job.philosophy_mode && (
              <span style={{
                fontFamily: "var(--font-jb)", fontSize: 10, color: accent,
                background: `${accent}12`, border: `1px solid ${accent}30`,
                borderRadius: 4, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.04em",
              }}>{job.philosophy_mode}</span>
            )}
          </div>
        </div>

        {/* Action badge with confidence */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          background: as.bg, border: `1px solid ${as.color}40`,
          borderRadius: 10, padding: "14px 24px", minWidth: 90,
        }}>
          <span style={{ fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 22, color: as.color, lineHeight: 1 }}>{run.action}</span>
          {confPct != null && (
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 13, color: as.color, marginTop: 4, opacity: 0.8 }}>{confPct}%</span>
          )}
        </div>
      </div>

      {/* Two-column: pipeline + decision */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* Left: Pipeline diagram */}
        <AgentPipelineDiagram run={run} ebc_mode={job.ebc_mode} />

        {/* Right: Decision + reasoning + execution */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Portfolio Decision */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
              Portfolio Decision
            </div>

            {/* Action + confidence */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                fontFamily: "var(--font-jb)", fontWeight: 700, fontSize: 18,
                color: as.color, background: as.bg, border: `1px solid ${as.color}40`,
                borderRadius: 6, padding: "6px 16px",
              }}>{run.action}</div>
              <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--dim)", background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 4, padding: "3px 10px", textTransform: "uppercase" }}>
                {job.ebc_mode}
              </div>
            </div>

            {/* Confidence bar */}
            {confPct != null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontFamily: "var(--font-jb)", fontSize: 9, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Confidence</span>
                  <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, fontWeight: 700, color: as.color }}>{confPct}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "var(--elevated)", overflow: "hidden" }}>
                  <div style={{ width: `${confPct}%`, height: "100%", borderRadius: 3, background: as.color }} />
                </div>
              </div>
            )}

            {/* Execution metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: run.reasoning ? 14 : 0 }}>
              {[
                { k: "Executed",  v: run.executed ? "Yes" : "No",  c: run.executed ? "#10b981" : "var(--ghost)" },
                { k: "Price",     v: run.simulated_price != null ? `$${run.simulated_price.toFixed(2)}` : "—", c: "var(--dim)" },
                { k: "P&L",       v: run.pnl != null ? `${run.pnl >= 0 ? "+" : ""}$${run.pnl.toFixed(2)}` : "—", c: run.pnl == null ? "var(--ghost)" : run.pnl >= 0 ? "#10b981" : "#ef4444" },
                { k: "Portfolio", v: run.portfolio_value_after != null ? `$${run.portfolio_value_after.toLocaleString()}` : "—", c: "var(--dim)" },
              ].map((m) => (
                <div key={m.k} style={{ background: "var(--elevated)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, fontFamily: "var(--font-jb)", color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{m.k}</div>
                  <div style={{ fontSize: 13, fontFamily: "var(--font-jb)", fontWeight: 700, color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Reasoning */}
          {run.reasoning && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Reasoning
              </div>
              <p style={{ margin: 0, fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
                {run.reasoning}
              </p>
            </div>
          )}

          {/* Skip reason */}
          {run.skipped_reason && !run.executed && (
            <div style={{ background: "var(--surface)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Skip Reason
              </div>
              <div style={{ fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
                {run.skipped_reason}
              </div>
            </div>
          )}

          {/* Error */}
          {run.error && (
            <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Pipeline Error
              </div>
              <div style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "#ef4444", lineHeight: 1.6 }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--dim)", background: "var(--elevated)", padding: "6px 10px", borderRadius: 6, flex: 1, wordBreak: "break-all" }}>
                  {run.trace_id}
                </code>
                <CopyButton text={run.trace_id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
