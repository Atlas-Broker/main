"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RiskParams = { stop_loss: number; take_profit: number; position_size: number; risk_reward_ratio: number };
type TracePanel = {
  technical?: { signal?: string; reasoning?: string; latency_ms?: number; indicators?: Record<string, unknown> };
  fundamental?: { signal?: string; reasoning?: string; latency_ms?: number; metrics?: Record<string, unknown> };
  sentiment?: { signal?: string; reasoning?: string; latency_ms?: number; sentiment_score?: number };
  synthesis?: { bull_case?: string; bear_case?: string; verdict?: string };
};
type Signal = {
  id: string; ticker: string; action: "BUY" | "SELL" | "HOLD";
  confidence: number; reasoning: string; boundary_mode: string;
  risk: RiskParams; created_at: string;
  status?: "awaiting_approval" | "rejected" | "executed";
  trace?: TracePanel;
};

const ACTION_COLOR = {
  BUY: "var(--bull)", SELL: "var(--bear)", HOLD: "var(--hold)",
} as const;

export default function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    params.then(({ id }) => {
      fetchWithAuth(`${API_URL}/v1/signals?limit=50`).then(async (res) => {
        if (!res) { setLoading(false); return; }
        const list: Signal[] = await res.json();
        setSignal(list.find((s) => s.id === id) ?? null);
        setLoading(false);
      });
    });
  }, [params]);

  async function handleApprove() {
    if (!signal) return;
    await fetchWithAuth(`${API_URL}/v1/signals/${signal.id}/approve`, { method: "POST" });
    setApproved(true);
  }

  if (loading) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--ghost)", fontSize: 13 }}>Loading…</span>
    </div>
  );

  if (!signal) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--ghost)", fontSize: 13 }}>Signal not found.</span>
    </div>
  );

  const c = ACTION_COLOR[signal.action];
  const isAdvisory = signal.boundary_mode === "advisory" || signal.status === "awaiting_approval";

  const agentNodes = [
    signal.trace?.fundamental && {
      label: "Fundamental Agent",
      text: signal.trace.fundamental.reasoning ?? "",
      signal: signal.trace.fundamental.signal,
      dot: signal.trace.fundamental.signal === "BUY" ? "var(--bull)" : signal.trace.fundamental.signal === "SELL" ? "var(--bear)" : "var(--hold)",
    },
    signal.trace?.sentiment && {
      label: "Sentiment Agent",
      text: signal.trace.sentiment.reasoning ?? "",
      signal: signal.trace.sentiment.signal,
      dot: signal.trace.sentiment.signal === "BUY" ? "var(--bull)" : signal.trace.sentiment.signal === "SELL" ? "var(--bear)" : "var(--hold)",
    },
    signal.trace?.technical && {
      label: "Technical Agent",
      text: signal.trace.technical.reasoning ?? "",
      signal: signal.trace.technical.signal,
      dot: signal.trace.technical.signal === "BUY" ? "var(--bull)" : signal.trace.technical.signal === "SELL" ? "var(--bear)" : "var(--hold)",
    },
    {
      label: "Risk Agent",
      text: `Stop −${signal.risk.stop_loss}%, target +${signal.risk.take_profit}%. R:R ${signal.risk.risk_reward_ratio}. Size: $${signal.risk.position_size.toLocaleString()}.`,
      dot: "var(--hold)",
    },
  ].filter(Boolean) as { label: string; text: string; signal?: string; dot: string }[];

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", maxWidth: 520, margin: "0 auto" }}>
      <header style={{
        background: "var(--header-bg)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)", padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20,
      }}>
        <button onClick={() => router.back()} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 20, padding: 0 }}>←</button>
        <span className="font-display font-bold" style={{ fontSize: 17, color: "var(--ink)" }}>Signal Detail</span>
      </header>

      <main style={{ padding: "20px" }}>
        {/* Hero */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className="font-display font-bold" style={{ fontSize: 32, color: "var(--ink)", letterSpacing: "-0.02em" }}>{signal.ticker}</div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
              {new Date(signal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {signal.boundary_mode}
            </div>
          </div>
          <div style={{
            background: `${c}15`, border: `1px solid ${c}40`,
            borderRadius: 10, padding: "10px 16px", textAlign: "center",
          }}>
            <div className="font-display font-bold" style={{ fontSize: 22, color: c }}>{signal.action}</div>
            <div className="num" style={{ color: c, fontSize: 13, marginTop: 2 }}>{Math.round(signal.confidence * 100)}%</div>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="conf-bar-track" style={{ marginBottom: 20 }}>
          <div className="conf-bar-fill" style={{ width: `${signal.confidence * 100}%`, background: c }} />
        </div>

        {/* Agent timeline */}
        {agentNodes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", marginBottom: 12 }}>REASONING CHAIN</div>
            <div className="agent-timeline">
              {agentNodes.map((node, i) => (
                <div key={i} className="agent-timeline-node" style={{ marginBottom: 14 }}>
                  <div style={{ flexShrink: 0, marginTop: 4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: node.dot, border: "2px solid var(--bg)" }} />
                  </div>
                  <div>
                    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                      {node.label}
                      {node.signal && (
                        <span style={{
                          marginLeft: 8, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                          color: node.dot, border: `1px solid ${node.dot}60`,
                        }}>{node.signal}</span>
                      )}
                    </div>
                    <div style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.5 }}>{node.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk params */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: 10, padding: "14px 16px", marginBottom: 20,
        }}>
          <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em", marginBottom: 10 }}>RISK PARAMETERS</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Stop Loss",    value: `${signal.risk.stop_loss}%` },
              { label: "Take Profit",  value: `${signal.risk.take_profit}%` },
              { label: "Position",     value: `$${signal.risk.position_size.toLocaleString()}` },
              { label: "R/R Ratio",    value: `${signal.risk.risk_reward_ratio}:1` },
            ].map((r) => (
              <div key={r.label}>
                <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 3 }}>{r.label.toUpperCase()}</div>
                <div className="num" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{r.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        {isAdvisory && !approved && (
          <button
            onClick={handleApprove}
            style={{
              width: "100%", padding: "14px 0", borderRadius: 10, border: "none",
              background: c, color: "#fff", fontSize: 15,
              fontFamily: "var(--font-body)", fontWeight: 700, cursor: "pointer",
            }}
          >
            Accept & Execute
          </button>
        )}
        {approved && (
          <div style={{
            textAlign: "center", padding: "14px", borderRadius: 10,
            background: "var(--bull-bg)", color: "var(--bull)", fontFamily: "var(--font-mono)", fontSize: 13,
          }}>
            ✓ Executed
          </div>
        )}
        {!isAdvisory && signal.status === "executed" && (
          <div style={{
            textAlign: "center", padding: "14px", borderRadius: 10,
            background: "var(--bull-bg)", color: "var(--bull)", fontFamily: "var(--font-mono)", fontSize: 13,
          }}>
            AI executed at {new Date(signal.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </main>
    </div>
  );
}
