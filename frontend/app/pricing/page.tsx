import React from "react";
import { BillingToggle } from "./BillingToggle";

// ─── Feature data ──────────────────────────────────────────────────────────────

type Cell = "✓" | "—" | (string & {});

interface Feature {
  name: string;
  desc?: string;
  free: Cell;
  pro: Cell;
  max: Cell;
}

interface Section {
  title: string;
  features: Feature[];
}

const SECTIONS: Section[] = [
  {
    title: "Signal Engine",
    features: [
      { name: "AI-generated signals",          desc: "Multi-agent analysis on every ticker",    free: "✓", pro: "✓", max: "✓" },
      { name: "Advisory mode",                 desc: "Signals surfaced for your review",        free: "✓", pro: "✓", max: "✓" },
      { name: "Autonomous trading",            desc: "Atlas executes trades automatically",     free: "—", pro: "✓", max: "✓" },
      { name: "Guardrail confidence threshold",desc: "Hold trades below your confidence floor", free: "—", pro: "✓", max: "✓" },
    ],
  },
  {
    title: "Portfolio",
    features: [
      { name: "Ticker watchlist",              free: "5 tickers", pro: "Unlimited", max: "Unlimited" },
      { name: "Equity curve & P&L tracking",  free: "✓", pro: "✓", max: "✓" },
      { name: "Decision log (AI reasoning)",   desc: "Full audit trail of every signal",        free: "—", pro: "✓", max: "✓" },
      { name: "Backtesting engine",            desc: "Test strategies on historical data",      free: "—", pro: "✓", max: "✓" },
    ],
  },
  {
    title: "Broker & Integrations",
    features: [
      { name: "Alpaca (paper & live)",         free: "✓", pro: "✓", max: "✓" },
      { name: "Interactive Brokers (IBKR)",    free: "—", pro: "—", max: "✓" },
      { name: "OAuth broker connect",          desc: "One-click broker authentication",         free: "—", pro: "—", max: "✓" },
    ],
  },
  {
    title: "Support",
    features: [
      { name: "Email support",                 free: "✓",  pro: "Priority", max: "Priority" },
      { name: "Onboarding call",               free: "—",  pro: "—",        max: "✓" },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function CellValue({ value, col }: { value: Cell; col: "free" | "pro" | "max" }) {
  const color =
    value === "✓" ? (col === "free" ? "var(--bull)" : col === "pro" ? "#7B61FF" : "#F5A623") :
    value === "—" ? "#2a3a50" :
    col === "pro"  ? "#7B61FF" :
    col === "max"  ? "#F5A623" :
    "var(--ghost)";

  return (
    <span style={{
      display: "block", textAlign: "center",
      fontSize: value === "✓" || value === "—" ? 18 : 12,
      fontWeight: value !== "✓" && value !== "—" ? 600 : 400,
      color,
    }}>
      {value}
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <>
      <style>{`
        .pr-section-row td            { background: var(--deep, #080d18); }
        .pr-section-row td.pr-pro-col { background: rgba(123,97,255,0.06); }
        .pr-feat-row td               { background: var(--surface); border-bottom: 1px solid rgba(255,255,255,0.04); }
        .pr-feat-row:last-child td    { border-bottom: none; }
        .pr-feat-row td.pr-pro-col    { background: rgba(123,97,255,0.04); }

      `}</style>

      <div style={{ background: "var(--bg)", minHeight: "100vh", color: "var(--ink)" }}>

        {/* ── Hero ── */}
        <section style={{ padding: "72px 20px 0", textAlign: "center" }}>
          <div style={{
            fontSize: 11, letterSpacing: "2px", textTransform: "uppercase",
            color: "#7B61FF", marginBottom: 14, fontWeight: 600,
            fontFamily: "var(--font-body)",
          }}>
            Simple, transparent pricing
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "clamp(2rem, 6vw, 3.2rem)",
            letterSpacing: "-0.03em", lineHeight: 1.1,
            color: "var(--ink)", marginBottom: 14,
          }}>
            Invest with intelligence
          </h1>
          <p style={{
            fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.7,
            color: "var(--dim)", maxWidth: 400, margin: "0 auto 48px",
          }}>
            Start free. Upgrade when you&apos;re ready to let Atlas trade for you.
          </p>
        </section>

        {/* ── BillingToggle island (toggle + cards) ── */}
        <section style={{ padding: "0 20px" }}>
          <BillingToggle />
        </section>

        {/* ── Feature comparison table ── */}
        <section style={{ padding: "0 20px 80px" }}>
          <div style={{ maxWidth: 780, margin: "0 auto", overflowX: "auto" }}>
            <table style={{
              width: "100%", borderCollapse: "collapse",
              border: "1px solid var(--line)", borderTop: "none",
              borderRadius: "0 0 14px 14px", overflow: "hidden",
              minWidth: 540,
            }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th style={{
                    width: "46%", padding: "14px 20px", textAlign: "left",
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "1px", color: "var(--ghost)",
                    background: "var(--surface)",
                  }}>Features</th>
                  {(["Free", "Pro", "Max"] as const).map((tier) => (
                    <th
                      key={tier}
                      className={tier === "Pro" ? "pr-pro-col" : undefined}
                      style={{
                        width: "18%", padding: "14px 16px", textAlign: "center",
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "1px",
                        color: tier === "Pro" ? "#7B61FF" : tier === "Max" ? "#F5A623" : "var(--ghost)",
                        background: tier === "Pro" ? "rgba(123,97,255,0.06)" : "var(--surface)",
                      }}
                    >{tier}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {SECTIONS.map((section) => (
                  <React.Fragment key={section.title}>
                    <tr className="pr-section-row">
                      <td style={{
                        padding: "8px 20px",
                        fontSize: 10, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "1.2px",
                        color: "var(--ghost)",
                        borderTop: "1px solid var(--line)",
                        borderBottom: "1px solid var(--line)",
                      }}>
                        {section.title}
                      </td>
                      <td style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} />
                      <td className="pr-pro-col" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} />
                      <td style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} />
                    </tr>

                    {section.features.map((feat) => (
                      <tr key={`${section.title}-${feat.name}`} className="pr-feat-row">
                        <td style={{ padding: "13px 20px", verticalAlign: "middle" }}>
                          <div style={{
                            fontFamily: "var(--font-body)", fontSize: 13,
                            color: "var(--ink)", fontWeight: 500,
                          }}>
                            {feat.name}
                          </div>
                          {feat.desc && (
                            <div style={{
                              fontFamily: "var(--font-body)", fontSize: 11,
                              color: "var(--ghost)", marginTop: 2,
                            }}>
                              {feat.desc}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                          <CellValue value={feat.free} col="free" />
                        </td>
                        <td className="pr-pro-col" style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                          <CellValue value={feat.pro} col="pro" />
                        </td>
                        <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                          <CellValue value={feat.max} col="max" />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </>
  );
}
