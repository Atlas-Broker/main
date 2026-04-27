"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const PRICES = {
  monthly: { pro: 49 },
  annual:  { pro: 39 },
} as const;

type Billing = keyof typeof PRICES;

const LABEL_TO_BILLING: Record<"Monthly" | "Annual", Billing> = {
  Monthly: "monthly",
  Annual: "annual",
};

const fmtAnnual = (monthly: number): string =>
  `$${(monthly * 12).toLocaleString("en-US")} billed annually`;

export function BillingToggle() {
  const [billing, setBilling] = useState<Billing>("annual");
  const [loading, setLoading] = useState(false);
  const { isSignedIn } = useAuth();
  const p = PRICES[billing];

  async function handleProClick() {
    if (!isSignedIn) {
      window.location.href = "/login";
      return;
    }
    const priceId =
      billing === "annual"
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID;

    if (!priceId) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_id: priceId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      // fall through
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @media (max-width: 639px) {
          .pr-cards-wrap { grid-template-columns: 1fr !important; }
          .pr-cards-wrap > * {
            border-radius: 14px !important;
            border: 1px solid var(--line) !important;
            transform: none !important;
          }
        }
      `}</style>
      {/* ── Toggle row ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, marginBottom: 40,
      }}>
        <div style={{
          display: "flex", background: "var(--elevated)", borderRadius: 24,
          padding: 4, border: "1px solid var(--line)", gap: 2,
        }}>
          {(["Monthly", "Annual"] as const).map((label) => {
            const val = LABEL_TO_BILLING[label];
            const active = billing === val;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setBilling(val)}
                style={{
                  padding: "6px 18px", borderRadius: 20,
                  border: "none", cursor: "pointer",
                  fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
                  background: active ? "var(--tier-pro)" : "transparent",
                  color: active ? "#fff" : "var(--ghost)",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {billing === "annual" && (
          <span style={{
            fontSize: 11, color: "var(--bull)", fontWeight: 700,
            background: "rgba(0,200,150,0.1)", padding: "3px 9px",
            borderRadius: 20, border: "1px solid rgba(0,200,150,0.2)",
          }}>
            Save 20%
          </span>
        )}
      </div>

      {/* ── Pricing cards ── */}
      <div className="pr-cards-wrap" style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
        maxWidth: 520, margin: "0 auto",
      }}>

        {/* Free */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRight: "none", borderRadius: "14px 0 0 0",
          padding: "28px 24px 24px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "1.5px", color: "var(--ghost)", marginBottom: 14,
          }}>Free</div>
          <div style={{
            fontSize: 34, fontWeight: 800, letterSpacing: "-1.5px",
            lineHeight: 1, marginBottom: 4,
          }}>$0</div>
          <div style={{ fontSize: 11, color: "var(--ghost)", marginBottom: 20 }}>
            No credit card required
          </div>
          <Link href="/login" style={{
            display: "block", width: "100%", padding: "10px 16px",
            borderRadius: 8, textAlign: "center",
            border: "1px solid var(--line)", background: "transparent",
            color: "var(--ghost)", fontSize: 13, fontWeight: 600,
            textDecoration: "none", boxSizing: "border-box",
          }}>
            Get started
          </Link>
        </div>

        {/* Pro */}
        <div style={{
          background: "var(--elevated)",
          border: "1px solid var(--tier-pro)",
          borderRadius: "14px 14px 0 0",
          padding: "28px 24px 24px",
          position: "relative",
          transform: "translateY(-6px)",
          overflow: "visible",
          boxShadow: "0 0 0 1px var(--tier-pro), 0 8px 32px rgba(123,97,255,0.15)",
          zIndex: 1,
        }}>
          <div style={{
            position: "absolute", top: -13, left: "50%",
            transform: "translateX(-50%)",
            background: "var(--tier-pro)", color: "#fff",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.8px",
            textTransform: "uppercase", padding: "4px 14px",
            borderRadius: "0 0 8px 8px", whiteSpace: "nowrap",
          }}>
            Most popular
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "1.5px", color: "var(--tier-pro)", marginBottom: 14,
          }}>Pro</div>
          <div style={{
            fontSize: 34, fontWeight: 800, letterSpacing: "-1.5px",
            lineHeight: 1, marginBottom: 4,
          }}>
            <sup style={{ fontSize: 16, fontWeight: 700, verticalAlign: "super", letterSpacing: 0 }}>$</sup>
            {p.pro}
            <sub style={{ fontSize: 13, fontWeight: 400, color: "var(--ghost)", verticalAlign: "baseline" }}>/mo</sub>
          </div>
          <div style={{ fontSize: 11, color: "var(--ghost)", marginBottom: 20 }}>
            {billing === "annual" ? fmtAnnual(PRICES.annual.pro) : "Switch to annual to save 20%"}
          </div>
          <button
            type="button"
            onClick={handleProClick}
            disabled={loading}
            style={{
              display: "block", width: "100%", padding: "10px 16px",
              borderRadius: 8, textAlign: "center",
              background: loading ? "var(--dim)" : "var(--tier-pro)", color: "#fff",
              fontSize: 13, fontWeight: 600,
              boxShadow: loading ? "none" : "0 2px 12px rgba(123,97,255,0.3)",
              boxSizing: "border-box", border: "none", cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Loading…" : "Start Pro trial"}
          </button>
        </div>

      </div>
    </>
  );
}
