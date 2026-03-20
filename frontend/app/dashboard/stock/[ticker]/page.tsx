// frontend/app/dashboard/stock/[ticker]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDecisionLog, type DecisionLogEntry } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function StockLogPage({ params }: { params: Promise<{ ticker: string }> }) {
  const router = useRouter();
  const [ticker, setTicker] = useState<string>("");
  const [entries, setEntries] = useState<DecisionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    params.then(({ ticker: t }) => {
      const upper = t.toUpperCase();
      setTicker(upper);
      fetchDecisionLog(API_URL, upper, 20).then((data) => {
        setEntries(data);
        setLoading(false);
      });
    });
  }, [params]);

  const visible = showAll ? entries : entries.slice(0, 5);
  const ACTION_COLOR = {
    BUY:  "var(--bull)",
    SELL: "var(--bear)",
    HOLD: "var(--hold)",
  } as const;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", maxWidth: 520, margin: "0 auto" }}>
      <header style={{
        background: "var(--header-bg)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)", padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20,
      }}>
        <button onClick={() => router.back()} style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--ghost)", fontSize: 20, padding: 0, lineHeight: 1,
        }}>←</button>
        <span className="font-display font-bold" style={{ fontSize: 17, color: "var(--ink)" }}>{ticker} — AI Decision Log</span>
      </header>

      <main style={{ padding: "20px" }}>
        {loading ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", paddingTop: 48 }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", paddingTop: 48 }}>No AI decisions recorded for {ticker} yet.</div>
        ) : (
          <>
            <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "0 16px", marginBottom: 12 }}>
              {visible.map((entry, i) => {
                const c = ACTION_COLOR[entry.action];
                return (
                  <div key={i} className="decision-log-row">
                    <span style={{
                      flexShrink: 0, padding: "2px 8px", borderRadius: 4,
                      fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: c, background: `${c}20`, border: `1px solid ${c}40`,
                    }}>
                      {entry.action}
                    </span>
                    <div className="flex-1">
                      <div style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.4 }}>{entry.reasoning}</div>
                      <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 3 }}>
                        {formatTime(entry.created_at)} · {Math.round(entry.confidence * 100)}% confidence
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, width: 50 }}>
                      <div className="conf-bar-track">
                        <div className="conf-bar-fill" style={{ width: `${entry.confidence * 100}%`, background: c }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {entries.length > 5 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                style={{
                  width: "100%", padding: "10px 0", background: "var(--surface)",
                  border: "1px solid var(--line)", borderRadius: 8,
                  color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                }}
              >
                Show all {entries.length} decisions
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
