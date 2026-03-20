"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "../components/ThemeProvider";
import { fetchWithAuth, fetchMyProfile, type UserRole } from "@/lib/api";
import { AccountDropdown } from "@/components/AccountDropdown";
import { BacktestTab } from "./BacktestTab";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskParams = {
  stop_loss: number;
  take_profit: number;
  position_size: number;
  risk_reward_ratio: number;
};

type TracePanel = {
  technical?: {
    signal?: string;
    indicators?: Record<string, unknown>;
    reasoning?: string;
    model?: string;
    latency_ms?: number;
  };
  fundamental?: {
    signal?: string;
    metrics?: Record<string, unknown>;
    reasoning?: string;
    model?: string;
    latency_ms?: number;
  };
  sentiment?: {
    signal?: string;
    sentiment_score?: number;
    sources?: string[];
    reasoning?: string;
    model?: string;
    latency_ms?: number;
  };
  synthesis?: {
    bull_case?: string;
    bear_case?: string;
    verdict?: string;
    reasoning?: string;
  };
};

type Signal = {
  id: string;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  boundary_mode: string;
  risk: RiskParams;
  created_at: string;
  status?: "awaiting_approval" | "rejected" | "executed";
  trace?: TracePanel;
};

type Position = {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  pnl: number;
  // Override window fields — present on autonomous trades
  trade_id?: string;
  executed_at?: string;
  boundary_mode?: string;
};

type Portfolio = {
  total_value: number;
  cash: number;
  pnl_today: number;
  pnl_total: number;
  positions: Position[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, prefix = "$") {
  return prefix + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ACTION_STYLE = {
  BUY:  { color: "var(--bull)", bg: "var(--bull-bg)", glow: "signal-glow-bull" },
  SELL: { color: "var(--bear)", bg: "var(--bear-bg)", glow: "signal-glow-bear" },
  HOLD: { color: "var(--hold)", bg: "var(--hold-bg)", glow: "signal-glow-hold" },
} as const;

type Tab = "overview" | "signals" | "positions" | "settings" | "backtest";

// ─── Sub-components ───────────────────────────────────────────────────────────

type ToastSeverity = "error" | "info";

function showToast(message: string, severity: ToastSeverity = "error") {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = [
    "position:fixed",
    "bottom:80px",
    "left:50%",
    "transform:translateX(-50%)",
    "padding:10px 18px",
    "border-radius:8px",
    "font-size:13px",
    "font-family:var(--font-nunito)",
    "z-index:9999",
    "pointer-events:none",
    "max-width:90vw",
    "text-align:center",
    severity === "error"
      ? "background:var(--bear-bg);color:var(--bear);border:1px solid var(--bear)30"
      : "background:var(--hold-bg);color:var(--hold);border:1px solid var(--hold)30",
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="conf-bar-track" style={{ width: "100%" }}>
      <div className="conf-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    advisory:              "var(--dim)",
    conditional:           "var(--hold)",   // kept for display of legacy signals
    autonomous:            "var(--bull)",
    autonomous_guardrail:  "var(--brand)",
  };
  return (
    <span style={{
      fontSize: 10,
      fontFamily: "var(--font-jb)",
      color: colors[mode] ?? "var(--dim)",
      border: `1px solid ${colors[mode] ?? "var(--line)"}`,
      padding: "2px 8px",
      borderRadius: 4,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      opacity: 0.85,
    }}>
      {mode}
    </span>
  );
}

export function SignalCard({
  signal,
  isPrimary,
  onReject,
}: {
  signal: Signal;
  isPrimary?: boolean;
  onReject?: (id: string) => void;
}) {
  const router = useRouter();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const s = ACTION_STYLE[signal.action];
  const isConditional =
    signal.boundary_mode === "conditional" ||
    (signal.boundary_mode === "autonomous_guardrail" &&
      signal.status === "awaiting_approval");
  const canApprove = isConditional && approved === null;

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetchWithAuth(
        `${API_URL}/v1/signals/${signal.id}/approve`,
        { method: "POST" }
      );
      if (!res) { router.push("/login"); return; }
      setApproved(true);
    } catch {
      setApproved(true);
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    setRejecting(true);
    try {
      const resp = await fetchWithAuth(`${API_URL}/v1/signals/${signal.id}/reject`, {
        method: "POST",
      });
      if (!resp) return; // auth failed, user being redirected
      if (resp.ok) {
        setApproved(false);
        onReject?.(signal.id);
      } else if (resp.status === 409) {
        showToast("This signal was already executed");
      } else if (resp.status === 404) {
        showToast("Signal not found");
      } else if (resp.status === 400) {
        showToast("Invalid signal");
      } else {
        showToast("Something went wrong, please try again");
      }
    } catch {
      showToast("Something went wrong, please try again");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div
      className={isPrimary ? s.glow : ""}
      style={{
        background: "var(--surface)",
        border: `1px solid ${s.color}40`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div style={{ height: 3, background: s.color, opacity: 0.8 }} />

      <div style={{ padding: "16px 18px" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {isPrimary && <span className="live-dot-red" />}
            <span className="font-display font-bold" style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {signal.ticker}
            </span>
            <ModeBadge mode={signal.boundary_mode} />
          </div>
          <div className="font-display font-bold" style={{ fontSize: 22, color: s.color }}>
            {signal.action}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <ConfBar value={signal.confidence} color={s.color} />
          <span className="num" style={{ fontSize: 12, color: s.color, whiteSpace: "nowrap" }}>
            {Math.round(signal.confidence * 100)}%
          </span>
        </div>

        <p style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-nunito)", lineHeight: 1.6, marginBottom: 14 }}>
          {signal.reasoning}
        </p>

        {signal.action !== "HOLD" && (
          <div className="grid grid-cols-3 gap-2 mb-4" style={{
            background: "var(--elevated)",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
          }}>
            {[
              { label: "Stop",   value: `$${signal.risk.stop_loss}` },
              { label: "Target", value: `$${signal.risk.take_profit}` },
              { label: "R/R",    value: `${signal.risk.risk_reward_ratio}:1` },
            ].map((r) => (
              <div key={r.label} className="text-center">
                <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 2 }}>{r.label}</div>
                <div className="num" style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>{r.value}</div>
              </div>
            ))}
          </div>
        )}

        {signal.trace && (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setShowTrace((v) => !v)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ghost)",
                fontSize: 11,
                fontFamily: "var(--font-jb)",
                padding: "4px 0",
                letterSpacing: "0.04em",
              }}
            >
              {showTrace ? "Hide reasoning ↑" : "View reasoning →"}
            </button>

            {showTrace && (
              <div style={{
                marginTop: 8,
                border: "1px solid var(--line)",
                borderRadius: 8,
                overflow: "hidden",
              }}>
                {/* Technical panel */}
                {signal.trace.technical && (
                  <div style={{ padding: "12px 14px", borderBottom: signal.trace.fundamental || signal.trace.sentiment || signal.trace.synthesis ? "1px solid var(--line)" : undefined }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.06em" }}>TECHNICAL</span>
                        {signal.trace.technical.signal && (
                          <span style={{
                            fontSize: 9,
                            fontFamily: "var(--font-jb)",
                            color: signal.trace.technical.signal === "BUY" ? "var(--bull)" : signal.trace.technical.signal === "SELL" ? "var(--bear)" : "var(--hold)",
                            border: `1px solid ${signal.trace.technical.signal === "BUY" ? "var(--bull)" : signal.trace.technical.signal === "SELL" ? "var(--bear)" : "var(--hold)"}`,
                            padding: "1px 6px",
                            borderRadius: 3,
                          }}>
                            {signal.trace.technical.signal}
                          </span>
                        )}
                      </div>
                      {signal.trace.technical.latency_ms != null && (
                        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>{signal.trace.technical.latency_ms}ms</span>
                      )}
                    </div>
                    {signal.trace.technical.reasoning && (
                      <p style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.55, margin: 0, marginBottom: signal.trace.technical.indicators ? 8 : 0 }}>
                        {signal.trace.technical.reasoning}
                      </p>
                    )}
                    {signal.trace.technical.indicators && Object.keys(signal.trace.technical.indicators).length > 0 && (
                      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
                        {Object.entries(signal.trace.technical.indicators).slice(0, 4).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)", background: "var(--elevated)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 4 }}>
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Fundamental panel */}
                {signal.trace.fundamental && (
                  <div style={{ padding: "12px 14px", borderBottom: signal.trace.sentiment || signal.trace.synthesis ? "1px solid var(--line)" : undefined }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.06em" }}>FUNDAMENTAL</span>
                        {signal.trace.fundamental.signal && (
                          <span style={{
                            fontSize: 9,
                            fontFamily: "var(--font-jb)",
                            color: signal.trace.fundamental.signal === "BUY" ? "var(--bull)" : signal.trace.fundamental.signal === "SELL" ? "var(--bear)" : "var(--hold)",
                            border: `1px solid ${signal.trace.fundamental.signal === "BUY" ? "var(--bull)" : signal.trace.fundamental.signal === "SELL" ? "var(--bear)" : "var(--hold)"}`,
                            padding: "1px 6px",
                            borderRadius: 3,
                          }}>
                            {signal.trace.fundamental.signal}
                          </span>
                        )}
                      </div>
                      {signal.trace.fundamental.latency_ms != null && (
                        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>{signal.trace.fundamental.latency_ms}ms</span>
                      )}
                    </div>
                    {signal.trace.fundamental.reasoning && (
                      <p style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.55, margin: 0, marginBottom: signal.trace.fundamental.metrics ? 8 : 0 }}>
                        {signal.trace.fundamental.reasoning}
                      </p>
                    )}
                    {signal.trace.fundamental.metrics && Object.keys(signal.trace.fundamental.metrics).length > 0 && (
                      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
                        {Object.entries(signal.trace.fundamental.metrics).slice(0, 4).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)", background: "var(--elevated)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 4 }}>
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sentiment panel */}
                {signal.trace.sentiment && (
                  <div style={{ padding: "12px 14px", borderBottom: signal.trace.synthesis ? "1px solid var(--line)" : undefined }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.06em" }}>SENTIMENT</span>
                        {signal.trace.sentiment.signal && (
                          <span style={{
                            fontSize: 9,
                            fontFamily: "var(--font-jb)",
                            color: signal.trace.sentiment.signal === "BUY" ? "var(--bull)" : signal.trace.sentiment.signal === "SELL" ? "var(--bear)" : "var(--hold)",
                            border: `1px solid ${signal.trace.sentiment.signal === "BUY" ? "var(--bull)" : signal.trace.sentiment.signal === "SELL" ? "var(--bear)" : "var(--hold)"}`,
                            padding: "1px 6px",
                            borderRadius: 3,
                          }}>
                            {signal.trace.sentiment.signal}
                          </span>
                        )}
                      </div>
                      {signal.trace.sentiment.latency_ms != null && (
                        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>{signal.trace.sentiment.latency_ms}ms</span>
                      )}
                    </div>
                    {signal.trace.sentiment.reasoning && (
                      <p style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.55, margin: 0 }}>
                        {signal.trace.sentiment.reasoning}
                      </p>
                    )}
                    {(signal.trace.sentiment.sentiment_score != null || (signal.trace.sentiment.sources && signal.trace.sentiment.sources.length > 0)) && (
                      <div className="flex gap-2" style={{ marginTop: 6 }}>
                        {signal.trace.sentiment.sentiment_score != null && (
                          <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)", background: "var(--elevated)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 4 }}>
                            score: {signal.trace.sentiment.sentiment_score.toFixed(2)}
                          </span>
                        )}
                        {signal.trace.sentiment.sources && signal.trace.sentiment.sources.length > 0 && (
                          <span style={{ fontSize: 10, fontFamily: "var(--font-jb)", color: "var(--ghost)", background: "var(--elevated)", border: "1px solid var(--line)", padding: "2px 6px", borderRadius: 4 }}>
                            {signal.trace.sentiment.sources.length} sources
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Synthesis panel */}
                {signal.trace.synthesis && (
                  <div style={{ padding: "12px 14px", background: "var(--elevated)" }}>
                    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", letterSpacing: "0.06em", marginBottom: 10 }}>SYNTHESIS</div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {signal.trace.synthesis.bull_case && (
                        <div>
                          <div style={{ color: "var(--bull)", fontSize: 9, fontFamily: "var(--font-jb)", marginBottom: 4, letterSpacing: "0.04em" }}>BULL CASE</div>
                          <p style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.5, margin: 0 }}>
                            {signal.trace.synthesis.bull_case}
                          </p>
                        </div>
                      )}
                      {signal.trace.synthesis.bear_case && (
                        <div>
                          <div style={{ color: "var(--bear)", fontSize: 9, fontFamily: "var(--font-jb)", marginBottom: 4, letterSpacing: "0.04em" }}>BEAR CASE</div>
                          <p style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.5, margin: 0 }}>
                            {signal.trace.synthesis.bear_case}
                          </p>
                        </div>
                      )}
                    </div>
                    {signal.trace.synthesis.verdict && (
                      <div style={{
                        padding: "8px 10px",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                      }}>
                        <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-jb)", marginBottom: 4, letterSpacing: "0.04em" }}>VERDICT</div>
                        <p style={{ color: "var(--ink)", fontSize: 12, fontFamily: "var(--font-nunito)", lineHeight: 1.5, margin: 0, fontWeight: 600 }}>
                          {signal.trace.synthesis.verdict}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {canApprove && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 font-semibold py-3 rounded transition-all"
              style={{
                background: approving ? "var(--line)" : s.color,
                color: "#fff",
                fontSize: 14,
                fontFamily: "var(--font-nunito)",
                border: "none",
                cursor: approving ? "not-allowed" : "pointer",
              }}
            >
              {approving ? "Executing…" : "✓ Approve & Execute"}
            </button>
            <button
              onClick={handleReject}
              disabled={rejecting || approved === false}
              className="font-semibold px-5 py-3 rounded transition-colors"
              style={{
                background: approved === false ? "var(--bear-bg)" : "transparent",
                border: `1px solid ${approved === false ? "var(--bear)" : "var(--bear-bg)"}`,
                color: "var(--bear)",
                fontSize: 14,
                fontFamily: "var(--font-nunito)",
                cursor: rejecting || approved === false ? "not-allowed" : "pointer",
                opacity: approved === false ? 0.7 : 1,
                minWidth: 44,
              }}
            >
              {rejecting ? "…" : approved === false ? "Rejected ✓" : "✗"}
            </button>
          </div>
        )}

        {isConditional && approved !== null && (
          <div className="text-center py-3 rounded font-semibold text-sm" style={{
            background: approved ? "var(--bull-bg)" : "var(--bear-bg)",
            color: approved ? "var(--bull)" : "var(--bear)",
            border: `1px solid ${approved ? "var(--bull)" : "var(--bear)"}30`,
            fontFamily: "var(--font-nunito)",
          }}>
            {approved ? "Trade approved — order placed via Alpaca" : "Signal rejected"}
          </div>
        )}

        <div style={{ marginTop: 10, color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
          {relTime(signal.created_at)}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  portfolio,
  signals,
  onReject,
}: {
  portfolio: Portfolio | null;
  signals: Signal[];
  onReject?: (id: string) => void;
}) {
  const primary = signals[0] ?? null;
  const pnlPos = portfolio ? portfolio.pnl_today >= 0 : true;

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Portfolio card */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 20px 16px", boxShadow: "var(--card-shadow)" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 6 }}>PORTFOLIO VALUE</div>
        <div className="num font-display font-bold" style={{ fontSize: 38, color: "var(--ink)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {portfolio ? fmt(portfolio.total_value) : "—"}
        </div>
        {portfolio && (
          <div className="flex items-center gap-3 mt-2">
            <span className="num" style={{ fontSize: 14, color: pnlPos ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>
              {pnlPos ? "+" : ""}{fmt(portfolio.pnl_today)} unrealised
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          <div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 3 }}>CASH</div>
            <div className="num" style={{ color: "var(--dim)", fontSize: 16, fontWeight: 600 }}>{portfolio ? fmt(portfolio.cash) : "—"}</div>
          </div>
          <div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 3 }}>TOTAL P&amp;L</div>
            <div className="num" style={{ color: portfolio && portfolio.pnl_total >= 0 ? "var(--bull)" : "var(--bear)", fontSize: 16, fontWeight: 600 }}>
              {portfolio ? `${portfolio.pnl_total >= 0 ? "+" : ""}${fmt(portfolio.pnl_total)}` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Latest signal */}
      {primary && (
        <div>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
            <span className="live-dot-red" /> LATEST SIGNAL
          </div>
          <SignalCard signal={primary} isPrimary onReject={onReject} />
        </div>
      )}

      {/* Quick positions */}
      {portfolio && portfolio.positions.length > 0 && (
        <div>
          <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 12 }}>POSITIONS</div>
          <div className="flex flex-col gap-2">
            {portfolio.positions.map((pos) => (
              <div key={pos.ticker} className="flex items-center justify-between" style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "12px 14px",
                boxShadow: "var(--card-shadow)",
              }}>
                <div>
                  <span className="font-display font-bold" style={{ color: "var(--ink)", fontSize: 16 }}>{pos.ticker}</span>
                  <span className="num" style={{ color: "var(--ghost)", fontSize: 12, marginLeft: 8 }}>{pos.shares} shares</span>
                </div>
                <div className="text-right">
                  <div className="num" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{fmt(pos.current_price)}</div>
                  <div className="num" style={{ color: pos.pnl >= 0 ? "var(--bull)" : "var(--bear)", fontSize: 12 }}>
                    {pos.pnl >= 0 ? "+" : ""}{fmt(pos.pnl)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {portfolio && portfolio.positions.length === 0 && (
        <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "24px 0" }}>
          No open positions yet.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Signals ─────────────────────────────────────────────────────────────

function SignalsTab({
  signals,
  loading,
  onReject,
}: {
  signals: Signal[];
  loading: boolean;
  onReject?: (id: string) => void;
}) {
  if (loading) return <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>Loading signals…</div>;
  if (!signals.length) return <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>No signals yet — run the pipeline from admin.</div>;

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>
        ALL SIGNALS — {signals.length} RUNS
      </div>
      {signals.map((sig) => <SignalCard key={sig.id} signal={sig} onReject={onReject} />)}
    </div>
  );
}

// ─── OverrideButton ───────────────────────────────────────────────────────────

type OverrideButtonProps = {
  tradeId: string;
  executedAt: string;
  onSuccess: () => void;
};

export function OverrideButton({ tradeId, executedAt, onSuccess }: OverrideButtonProps) {
  const WINDOW_MS = 300_000; // 5 minutes

  function getSecondsRemaining(): number {
    const elapsed = Date.now() - new Date(executedAt).getTime();
    return Math.max(0, Math.floor((WINDOW_MS - elapsed) / 1000));
  }

  const [secondsLeft, setSecondsLeft] = useState<number>(getSecondsRemaining);
  const [overriding, setOverriding] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft(getSecondsRemaining());
    }, 1000);
    return () => clearInterval(id);
  }, [executedAt]);

  const expired = secondsLeft <= 0;
  const disabled = expired || overriding || done;

  function formatCountdown(s: number): string {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
  }

  async function handleClick() {
    if (!window.confirm("Cancel this trade? This cannot be undone.")) return;
    setOverriding(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/v1/trades/${tradeId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "user_initiated" }),
      });
      if (!res) {
        window.alert("Authentication failed — please refresh and try again.");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setDone(true);
        onSuccess();
      } else {
        window.alert(data.message ?? "Override logged; order may have already filled.");
        setDone(true);
        onSuccess();
      }
    } catch {
      window.alert("Network error — could not reach the server.");
    } finally {
      setOverriding(false);
    }
  }

  if (done) {
    return (
      <div style={{
        fontSize: 12,
        color: "var(--ghost)",
        fontFamily: "var(--font-jb)",
        marginTop: 8,
        padding: "6px 10px",
        background: "var(--elevated)",
        borderRadius: 6,
        textAlign: "center",
      }}>
        Override submitted
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={expired ? "Override window has closed" : `${formatCountdown(secondsLeft)} remaining`}
      style={{
        marginTop: 8,
        width: "100%",
        padding: "8px 0",
        borderRadius: 6,
        border: `1px solid ${expired ? "var(--line)" : "var(--bear)"}`,
        background: expired ? "var(--elevated)" : "var(--bear-bg)",
        color: expired ? "var(--ghost)" : "var(--bear)",
        fontSize: 12,
        fontFamily: "var(--font-jb)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !expired ? 0.6 : 1,
      }}
    >
      {overriding
        ? "Cancelling…"
        : expired
          ? "Override window closed"
          : `Override (${formatCountdown(secondsLeft)} remaining)`}
    </button>
  );
}

// ─── Tab: Positions ───────────────────────────────────────────────────────────

function PositionsTab({
  portfolio,
  refreshPortfolio,
}: {
  portfolio: Portfolio | null;
  refreshPortfolio: () => void;
}) {
  if (!portfolio) return <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>Loading positions…</div>;
  if (!portfolio.positions.length) return (
    <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "32px 0", textAlign: "center" }}>
      No open positions.<br /><span style={{ fontSize: 12 }}>Run the pipeline in Autonomous mode to place a paper trade.</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 4 }}>OPEN POSITIONS</div>
      {portfolio.positions.map((pos) => {
        const pnl_pct = ((pos.current_price - pos.avg_cost) / pos.avg_cost) * 100;
        const positive = pos.pnl >= 0;
        return (
          <div key={pos.ticker} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)" }}>{pos.ticker}</span>
              <span className="num" style={{ color: positive ? "var(--bull)" : "var(--bear)", fontSize: 16, fontWeight: 700 }}>
                {positive ? "+" : ""}{fmt(pos.pnl)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "SHARES",   value: String(pos.shares) },
                { label: "AVG COST", value: fmt(pos.avg_cost) },
                { label: "CURRENT",  value: fmt(pos.current_price) },
              ].map((r) => (
                <div key={r.label}>
                  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 3 }}>{r.label}</div>
                  <div className="num" style={{ color: "var(--dim)", fontSize: 14 }}>{r.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>RETURN</span>
                <span className="num" style={{ color: positive ? "var(--bull)" : "var(--bear)", fontSize: 12, fontWeight: 600 }}>
                  {positive ? "+" : ""}{pnl_pct.toFixed(1)}%
                </span>
              </div>
              <ConfBar value={Math.min(Math.abs(pnl_pct) / 20, 1)} color={positive ? "var(--bull)" : "var(--bear)"} />
            </div>
            {pos.trade_id && pos.executed_at &&
              (pos.boundary_mode === "autonomous" || pos.boundary_mode === "autonomous_guardrail") && (
              <OverrideButton
                tradeId={pos.trade_id}
                executedAt={pos.executed_at}
                onSuccess={refreshPortfolio}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Alpaca Connection ────────────────────────────────────────────────────────

type BrokerConn = {
  connected: boolean;
  broker: string | null;
  environment: string | null;
  api_key: string | null;
  api_secret_masked: string | null;
};

function AlpacaConnectionSection() {
  const [conn, setConn]           = useState<BrokerConn | null>(null);
  const [loading, setLoading]     = useState(true);
  const [apiKey, setApiKey]       = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [env, setEnv]             = useState<"paper" | "live">("paper");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [disconnecting, setDisc]  = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/v1/broker/connection`)
      .then((r) => r?.json())
      .then((data) => setConn(data ?? { connected: false, broker: null, environment: null, api_key: null, api_secret_masked: null }))
      .catch(() => setConn({ connected: false, broker: null, environment: null, api_key: null, api_secret_masked: null }))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/v1/broker/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, environment: env }),
      });
      if (!res) return;
      if (res.ok) {
        const masked = apiSecret.length > 4
          ? `${"*".repeat(apiSecret.length - 4)}${apiSecret.slice(-4)}`
          : "****";
        setConn({ connected: true, broker: "alpaca", environment: env, api_key: apiKey, api_secret_masked: masked });
        setApiKey("");
        setApiSecret("");
      } else {
        const err = await res.json().catch(() => ({}));
        setError((err as { detail?: string }).detail ?? "Connection failed. Check your keys and try again.");
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Alpaca? Scheduled runs will pause for your account.")) return;
    setDisc(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/v1/broker/connection`, { method: "DELETE" });
      if (res?.ok) {
        setConn({ connected: false, broker: null, environment: null, api_key: null, api_secret_masked: null });
      }
    } catch {
      // non-fatal
    } finally {
      setDisc(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    background: "var(--elevated)",
    color: "var(--ink)",
    fontSize: 13,
    fontFamily: "var(--font-jb)",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div>
      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>ALPACA ACCOUNT</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--card-shadow)" }}>

        {loading ? (
          <div style={{ padding: "18px", color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>
            Checking connection…
          </div>

        ) : conn?.connected ? (
          /* ── Connected state ── */
          <div style={{ padding: "16px 18px" }}>
            <div className="flex items-center gap-2 mb-3">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--bull)", flexShrink: 0 }} />
              <span style={{ color: "var(--bull)", fontSize: 13, fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                Connected to Alpaca
              </span>
              <span style={{
                fontSize: 10, fontFamily: "var(--font-jb)", color: conn.environment === "live" ? "var(--bear)" : "var(--hold)",
                border: `1px solid ${conn.environment === "live" ? "var(--bear)" : "var(--hold)"}`,
                padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: "0.06em",
              }}>
                {conn.environment ?? "paper"}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 mb-4" style={{ fontSize: 12, fontFamily: "var(--font-jb)" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--ghost)" }}>API KEY</span>
                <span style={{ color: "var(--dim)" }}>{conn.api_key ? `${conn.api_key.slice(0, 6)}…` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ghost)" }}>SECRET</span>
                <span style={{ color: "var(--dim)" }}>{conn.api_secret_masked ?? "—"}</span>
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 8,
                border: "1px solid var(--bear)40", background: "var(--bear-bg)",
                color: "var(--bear)", fontSize: 13, fontFamily: "var(--font-nunito)",
                fontWeight: 600, cursor: disconnecting ? "not-allowed" : "pointer",
                opacity: disconnecting ? 0.6 : 1,
              }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect Alpaca"}
            </button>
          </div>

        ) : (
          /* ── Not connected — form ── */
          <form onSubmit={handleConnect} style={{ padding: "16px 18px" }}>
            <p style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-nunito)", lineHeight: 1.6, marginBottom: 14 }}>
              Connect your Alpaca paper trading account. Signals will be attributed to you
              and the daily scheduler will run for your account automatically.
            </p>

            {/* Environment toggle */}
            <div className="flex gap-2 mb-3">
              {(["paper", "live"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnv(e)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 7,
                    border: `1px solid ${env === e ? (e === "live" ? "var(--bear)" : "var(--hold)") : "var(--line)"}`,
                    background: env === e ? (e === "live" ? "var(--bear-bg)" : "var(--hold-bg)") : "var(--elevated)",
                    color: env === e ? (e === "live" ? "var(--bear)" : "var(--hold)") : "var(--ghost)",
                    fontSize: 12, fontFamily: "var(--font-jb)", letterSpacing: "0.06em",
                    textTransform: "uppercase" as const, cursor: "pointer", fontWeight: env === e ? 600 : 400,
                  }}
                >
                  {e === "live" ? "⚠ Live" : "Paper"}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2.5">
              <div>
                <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
                  API KEY
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="PK…"
                  required
                  autoComplete="off"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: "block", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)", marginBottom: 5, letterSpacing: "0.06em" }}>
                  SECRET KEY
                </label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                  required
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 10, padding: "9px 12px", borderRadius: 7,
                background: "var(--bear-bg)", border: "1px solid var(--bear)30",
                color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !apiKey || !apiSecret}
              style={{
                marginTop: 14, width: "100%", padding: "11px 0", borderRadius: 8,
                background: saving || !apiKey || !apiSecret ? "var(--line)" : "var(--brand)",
                border: "none", color: "#fff", fontSize: 14,
                fontFamily: "var(--font-nunito)", fontWeight: 600,
                cursor: saving || !apiKey || !apiSecret ? "not-allowed" : "pointer",
                transition: "background 0.15s ease",
              }}
            >
              {saving ? "Verifying & saving…" : "Connect Alpaca"}
            </button>

            <p style={{ marginTop: 10, color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", textAlign: "center" }}>
              Find your keys at alpaca.markets → Paper Trading → API Keys
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────

type PhilosophyMode = "balanced" | "buffett" | "soros" | "lynch";

const PHILOSOPHY_OPTIONS: {
  id: PhilosophyMode;
  label: string;
  desc: string;
  color: string;
}[] = [
  {
    id: "balanced",
    label: "Balanced",
    desc: "No overlay. Default multi-factor reasoning.",
    color: "var(--dim)",
  },
  {
    id: "buffett",
    label: "Buffett",
    desc: "Intrinsic value, margin of safety, durable competitive moat.",
    color: "var(--bull)",
  },
  {
    id: "soros",
    label: "Soros",
    desc: "Reflexivity, macro trends, exploiting market misconceptions.",
    color: "var(--brand)",
  },
  {
    id: "lynch",
    label: "Lynch",
    desc: "GARP — growth at a reasonable price, sector rotation.",
    color: "var(--hold)",
  },
];

const PHILOSOPHY_LS_KEY = "atlas_philosophy_mode";

export function SettingsTab() {
  const { dark, toggle } = useTheme();
  const [mode, setMode] = useState<"advisory" | "autonomous" | "autonomous_guardrail">("advisory");
  const [philosophy, setPhilosophy] = useState<PhilosophyMode>("balanced");

  // Hydrate philosophy from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(PHILOSOPHY_LS_KEY) as PhilosophyMode | null;
    if (stored && PHILOSOPHY_OPTIONS.some((o) => o.id === stored)) {
      setPhilosophy(stored);
    }
  }, []);

  function handlePhilosophyChange(newPhilosophy: PhilosophyMode) {
    setPhilosophy(newPhilosophy);
    localStorage.setItem(PHILOSOPHY_LS_KEY, newPhilosophy);
  }

  const modes = [
    {
      id: "advisory",
      label: "Advisory",
      color: "var(--dim)",
      desc: "AI signals only. You review and execute every trade manually.",
    },
    {
      id: "autonomous_guardrail",
      label: "Autonomous + Guardrail",
      color: "var(--brand)",
      desc: "AI executes automatically. Signals below 65% confidence are held for your review.",
    },
    {
      id: "autonomous",
      label: "Autonomous",
      color: "var(--bull)",
      desc: "AI executes all signals automatically. 5-minute override window.",
    },
  ] as const;

  useEffect(() => {
    fetchWithAuth(`${API_URL}/v1/profile`)
      .then((res) => res?.json())
      .then((data) => {
        if (data?.boundary_mode) {
          setMode(data.boundary_mode);
        }
      })
      .catch(() => {
        // keep default "conditional" on error
      });
  }, []);

  async function handleModeChange(newMode: "advisory" | "autonomous" | "autonomous_guardrail") {
    setMode(newMode);
    try {
      await fetchWithAuth(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_mode: newMode }),
      });
    } catch {
      // non-fatal — local state already updated
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Appearance */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>APPEARANCE</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ color: "var(--ink)", fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                {dark ? "Dark mode" : "Light mode"}
              </div>
              <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", marginTop: 2 }}>
                {dark ? "IBKR terminal aesthetic" : "Clean light interface"}
              </div>
            </div>
            <button
              onClick={toggle}
              style={{
                width: 48,
                height: 26,
                borderRadius: 13,
                background: dark ? "var(--brand)" : "var(--line2)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s ease",
                flexShrink: 0,
              }}
              aria-label="Toggle theme"
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: 3,
                left: dark ? 25 : 3,
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* Execution mode */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>EXECUTION MODE</div>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => handleModeChange(m.id)}
            data-selected={mode === m.id ? "true" : "false"}
            className="text-left w-full mb-2"
            style={{
              background: mode === m.id ? "var(--elevated)" : "var(--surface)",
              border: `1px solid ${mode === m.id ? m.color : "var(--line)"}`,
              borderRadius: 10,
              padding: "14px 18px",
              cursor: "pointer",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold" style={{ fontSize: 15, color: mode === m.id ? m.color : "var(--dim)" }}>
                {m.label}
              </span>
              {mode === m.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />}
            </div>
            <p style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Philosophy mode */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>INVESTMENT PHILOSOPHY</div>
        {PHILOSOPHY_OPTIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePhilosophyChange(p.id)}
            data-selected={philosophy === p.id ? "true" : "false"}
            className="text-left w-full mb-2"
            style={{
              background: philosophy === p.id ? "var(--elevated)" : "var(--surface)",
              border: `1px solid ${philosophy === p.id ? p.color : "var(--line)"}`,
              borderRadius: 10,
              padding: "14px 18px",
              cursor: "pointer",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold" style={{ fontSize: 15, color: philosophy === p.id ? p.color : "var(--dim)" }}>
                {p.label}
              </span>
              {philosophy === p.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color }} />}
            </div>
            <p style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{p.desc}</p>
          </button>
        ))}
      </div>

      {/* Alpaca connection */}
      <AlpacaConnectionSection />

      {/* About */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>ABOUT</div>
        <div className="flex flex-col gap-2">
          {[
            ["Engine",  "Gemini 2.5 Flash"],
            ["Data",    "yfinance · 90d OHLCV"],
            ["Broker",  "Alpaca Paper Trading"],
            ["Market",  "US Equities"],
            ["Style",   "Swing Trading"],
            ["Version", "0.1.0 · Phase 2"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{k}</span>
              <span style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview",  label: "Overview",  icon: "◈" },
  { id: "signals",   label: "Signals",   icon: "◎" },
  { id: "positions", label: "Positions", icon: "▤" },
  { id: "settings",  label: "Settings",  icon: "⊙" },
  { id: "backtest",  label: "Backtest",  icon: "⏮" },
];

export default function UserDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  function fetchPortfolio() {
    fetchWithAuth(`${API_URL}/v1/portfolio`)
      .then((r) => r?.json())
      .then((data) => { if (data) setPortfolio(data); })
      .catch(console.error);
  }

  function handleRejectSignal(id: string) {
    setSignals((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: "rejected" as const } : s
      )
    );
  }

  useEffect(() => {
    // Wait for Clerk to finish loading before attempting authenticated fetches.
    // Without this guard, getToken() returns null during Clerk's init and the
    // dashboard incorrectly redirects to /login before auth is confirmed.
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/login"); return; }

    async function loadData() {
      const [portRes, sigsRes, profile] = await Promise.all([
        fetchWithAuth(`${API_URL}/v1/portfolio`),
        fetchWithAuth(`${API_URL}/v1/signals?limit=20`),
        fetchMyProfile(),
      ]);

      if (profile) setRole(profile.role);

      // null means network error or backend down — don't redirect, just show empty state
      try {
        if (portRes) { const port = await portRes.json(); setPortfolio(port); }
        if (sigsRes) { const sigs = await sigsRes.json(); setSignals(Array.isArray(sigs) ? sigs : []); }
      } catch (err) {
        console.error("Failed to parse dashboard data", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isLoaded, isSignedIn, router]);

  const primarySignal = signals[0] ?? null;
  const hasPendingConditional = signals.some(
    (s) =>
      s.status === "awaiting_approval" ||
      s.boundary_mode === "conditional" // legacy backward compat
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--bg)", maxWidth: 520, margin: "0 auto" }}>

      {/* ── Top header ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-4" style={{
        background: "var(--header-bg)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)",
      }}>
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center" style={{ width: 22, height: 22 }}>
            <div style={{ position: "absolute", width: 2, height: 18, background: "#C8102E", transform: "skewX(-14deg) translateX(2px)", borderRadius: 1 }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8102E", position: "relative", zIndex: 1, marginLeft: 3 }} />
          </div>
          <span className="font-display font-bold" style={{ fontSize: 17, color: "var(--ink)", letterSpacing: "-0.02em" }}>ATLAS</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="live-dot" />
            <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>live</span>
          </div>
          <AccountDropdown
            role={role}
            onSettings={() => setTab("settings")}
          />
        </div>
      </header>

      {/* ── Conditional pending banner ── */}
      {hasPendingConditional && (
        <div className="mx-4 mt-3 rounded-lg px-4 py-2.5 flex items-center justify-between" style={{
          background: "var(--hold-bg)",
          border: "1px solid var(--hold)30",
        }}>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--hold)", fontSize: 13, fontFamily: "var(--font-jb)" }}>!</span>
            <span style={{ color: "var(--hold)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>
              {primarySignal?.ticker} signal awaiting your approval
            </span>
          </div>
          <button onClick={() => setTab("signals")} style={{
            color: "var(--hold)", fontSize: 11, fontFamily: "var(--font-jb)",
            background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline",
          }}>
            Review →
          </button>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <main className="flex-1 px-4 pt-4 overflow-y-auto">
        {loading && tab !== "settings" ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", padding: "48px 0", textAlign: "center" }}>
            Connecting to Atlas API…
          </div>
        ) : (
          <>
            {tab === "overview"  && <OverviewTab portfolio={portfolio} signals={signals} onReject={handleRejectSignal} />}
            {tab === "signals"   && <SignalsTab signals={signals} loading={loading} onReject={handleRejectSignal} />}
            {tab === "positions" && <PositionsTab portfolio={portfolio} refreshPortfolio={fetchPortfolio} />}
            {tab === "settings"  && <SettingsTab />}
            {tab === "backtest"  && <BacktestTab role={role ?? undefined} />}
          </>
        )}
      </main>

      {/* ── Bottom nav ── */}
      <nav className="sticky bottom-0 z-20 grid grid-cols-5" style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center justify-center gap-1 py-3 transition-colors"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <span style={{ fontSize: 16, color: active ? "var(--brand)" : "var(--ghost)" }}>{t.icon}</span>
              <span style={{
                fontSize: 10,
                fontFamily: "var(--font-jb)",
                letterSpacing: "0.03em",
                color: active ? "var(--brand)" : "var(--ghost)",
                fontWeight: active ? 600 : 400,
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
