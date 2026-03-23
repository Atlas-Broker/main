# Pricing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/pricing` page with Free/Pro/Max tiers and fix stale content on the landing page.

**Architecture:** Server component page (`pricing/page.tsx`) renders the static hero and feature comparison table; a `"use client"` island (`BillingToggle.tsx`) manages the annual/monthly toggle and re-renders only the pricing cards. Landing page (`app/page.tsx`) has two stale references to `conditional` mode and `"Premium"` tier that are fixed as a prerequisite.

**Tech Stack:** Next.js 16 App Router · TypeScript · inline CSS with existing CSS custom properties · Jest + React Testing Library

---

## File Map

| Status | File | Responsibility |
|---|---|---|
| Modify | `frontend/app/page.tsx` | Remove `conditional` from MODES; rename `"Premium"` → `"Max"`; update signal preview panel |
| Create | `frontend/app/pricing/page.tsx` | Server component — hero, BillingToggle island, feature table |
| Create | `frontend/app/pricing/BillingToggle.tsx` | Client component — toggle pill + pricing cards, reacts to billing state |
| Create | `frontend/__tests__/BillingToggle.test.tsx` | Unit tests for toggle behaviour |
| Create | `frontend/__tests__/pricing.test.tsx` | Smoke tests for pricing page render |

---

## Task 1: Fix stale content on the landing page

**Files:**
- Modify: `frontend/app/page.tsx` (lines 5–33 and line 385)

### Context

`MODES` currently has three entries: `advisory`, `conditional`, `autonomous`. `conditional` is retired. The `autonomous` entry labels its tier `"Premium"` — rename to `"Max"`. The hero's signal preview panel hardcodes three execution mode labels, one of which is `"Conditional"`.

- [ ] **Step 1: Remove `conditional` from the MODES array**

  Open `frontend/app/page.tsx`. Replace the entire `MODES` constant (lines 5–33) with:

  ```tsx
  const MODES = [
    {
      id: "advisory",
      icon: "○",
      label: "Advisory",
      tier: "Free",
      desc: "Atlas generates AI signals and explains every one. You decide if and when to act.",
      accent: "var(--ghost)",
      featured: false,
    },
    {
      id: "autonomous",
      icon: "●",
      label: "Autonomous",
      tier: "Max",
      desc: "Atlas executes automatically within your risk limits. 5-minute override window on every order.",
      accent: "var(--bull)",
      featured: false,
    },
  ];
  ```

- [ ] **Step 2: Update the modes grid CSS to 2 columns at desktop**

  In the same file, find the `@media (min-width:960px)` block (around line 183) and change the `hp-modes-grid` rule from `repeat(3,1fr)` to `repeat(2,1fr)`:

  ```css
  .hp-modes-grid    { grid-template-columns:repeat(2,1fr); }
  ```

  (The tablet rule at 640px maps to `1fr 1fr` already — no change needed there.)

- [ ] **Step 3: Update the signal preview panel**

  Find this line (around line 385):
  ```tsx
  {["Advisory","Conditional","Autonomous"].map((m, i) => (
  ```
  Replace it with:
  ```tsx
  {["Advisory","Autonomous"].map((m, i) => (
  ```

  The `i===1` highlight logic that follows is unchanged — it will now highlight `"Autonomous"` (index 1), which is correct.

- [ ] **Step 4: Verify the build passes with no TypeScript errors**

  ```bash
  cd frontend
  npm run build 2>&1 | tail -20
  ```

  Expected: `✓ Compiled successfully` with no type errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/app/page.tsx
  git commit -m "fix: remove conditional mode and rename Premium to Max on landing page"
  ```

---

## Task 2: BillingToggle client component (TDD)

**Files:**
- Create: `frontend/__tests__/BillingToggle.test.tsx`
- Create: `frontend/app/pricing/BillingToggle.tsx`

### Context

`BillingToggle` renders the annual/monthly toggle pill, a "Save 20%" badge (visible in annual mode only), and the three pricing cards (Free, Pro, Max) with reactive prices. It is a `"use client"` component so Next.js can ship it as a client-side island while the parent page remains a server component.

CSS variables available from `globals.css` (already declared — do not redeclare):
- `--brand`: primary accent (used in landing page, maps to `#C8102E` — **note:** pricing page uses `--tier-pro: #7B61FF` for Pro and `--tier-max: #F5A623` for Max directly as hex fallbacks since these are the design-system tier colours)
- `--surface`, `--line`, `--ghost`, `--bull`, `--tier-pro`, `--tier-max`

Prices:
- Annual (default): Pro $39/mo · Max $119/mo
- Monthly: Pro $49/mo · Max $149/mo

- [ ] **Step 1: Write the failing tests**

  Create `frontend/__tests__/BillingToggle.test.tsx`:

  ```tsx
  import React from "react";
  import { render, screen, fireEvent } from "@testing-library/react";

  jest.mock("next/link", () => ({
    __esModule: true,
    default: ({
      href,
      children,
      style,
    }: {
      href: string;
      children: React.ReactNode;
      style?: React.CSSProperties;
    }) => <a href={href} style={style}>{children}</a>,
  }));

  import { BillingToggle } from "../app/pricing/BillingToggle";

  describe("BillingToggle", () => {
    it("defaults to annual billing and shows annual prices", () => {
      render(<BillingToggle />);
      expect(screen.getByText("39")).toBeInTheDocument();
      expect(screen.getByText("119")).toBeInTheDocument();
      expect(screen.getByText("Save 20%")).toBeInTheDocument();
    });

    it("switches to monthly prices when Monthly is clicked", () => {
      render(<BillingToggle />);
      fireEvent.click(screen.getByText("Monthly"));
      expect(screen.getByText("49")).toBeInTheDocument();
      expect(screen.getByText("149")).toBeInTheDocument();
      expect(screen.queryByText("Save 20%")).not.toBeInTheDocument();
    });

    it("switches back to annual when Annual is clicked", () => {
      render(<BillingToggle />);
      fireEvent.click(screen.getByText("Monthly"));
      fireEvent.click(screen.getByText("Annual"));
      expect(screen.getByText("39")).toBeInTheDocument();
      expect(screen.getByText("Save 20%")).toBeInTheDocument();
    });

    it("all CTA buttons link to /login", () => {
      render(<BillingToggle />);
      const links = screen.getAllByRole("link");
      links.forEach((link) => {
        expect(link).toHaveAttribute("href", "/login");
      });
    });
  });
  ```

- [ ] **Step 2: Run tests — expect them to FAIL**

  ```bash
  cd frontend
  npm test -- --testPathPattern=BillingToggle --no-coverage 2>&1 | tail -20
  ```

  Expected: `FAIL __tests__/BillingToggle.test.tsx` — module not found.

- [ ] **Step 3: Create the component**

  Create `frontend/app/pricing/BillingToggle.tsx`:

  ```tsx
  "use client";

  import { useState } from "react";
  import Link from "next/link";

  const PRICES = {
    monthly: { pro: 49,  max: 149 },
    annual:  { pro: 39,  max: 119 },
  } as const;

  type Billing = keyof typeof PRICES;

  export function BillingToggle() {
    const [billing, setBilling] = useState<Billing>("annual");
    const p = PRICES[billing];

    return (
      <>
        {/* ── Toggle row ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 12, marginBottom: 40,
        }}>
          <div style={{
            display: "flex", background: "#162033", borderRadius: 24,
            padding: 4, border: "1px solid var(--line)", gap: 2,
          }}>
            {(["Monthly", "Annual"] as const).map((label) => {
              const val: Billing = label.toLowerCase() as Billing;
              const active = billing === val;
              return (
                <button
                  key={label}
                  onClick={() => setBilling(val)}
                  style={{
                    padding: "6px 18px", borderRadius: 20,
                    border: "none", cursor: "pointer",
                    fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
                    background: active ? "#7B61FF" : "transparent",
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
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          maxWidth: 780, margin: "0 auto",
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
            background: "#162033",
            border: "1px solid #7B61FF",
            borderRadius: "14px 14px 0 0",
            padding: "28px 24px 24px",
            position: "relative",
            transform: "translateY(-6px)",
            overflow: "visible",
            boxShadow: "0 0 0 1px #7B61FF, 0 8px 32px rgba(123,97,255,0.15)",
            zIndex: 1,
          }}>
            <div style={{
              position: "absolute", top: -13, left: "50%",
              transform: "translateX(-50%)",
              background: "#7B61FF", color: "#fff",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.8px",
              textTransform: "uppercase", padding: "4px 14px",
              borderRadius: "0 0 8px 8px", whiteSpace: "nowrap",
            }}>
              Most popular
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "1.5px", color: "#7B61FF", marginBottom: 14,
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
              {billing === "annual" ? "$468 billed annually" : "Switch to annual to save 20%"}
            </div>
            <Link href="/login" style={{
              display: "block", width: "100%", padding: "10px 16px",
              borderRadius: 8, textAlign: "center",
              background: "#7B61FF", color: "#fff",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
              boxShadow: "0 2px 12px rgba(123,97,255,0.3)",
              boxSizing: "border-box",
            }}>
              Start Pro trial
            </Link>
          </div>

          {/* Max */}
          <div style={{
            background: "var(--surface)",
            border: "1px solid rgba(245,166,35,0.25)",
            borderLeft: "none", borderRadius: "0 14px 0 0",
            padding: "28px 24px 24px",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "1.5px", color: "#F5A623", marginBottom: 14,
            }}>Max</div>
            <div style={{
              fontSize: 34, fontWeight: 800, letterSpacing: "-1.5px",
              lineHeight: 1, marginBottom: 4,
            }}>
              <sup style={{ fontSize: 16, fontWeight: 700, verticalAlign: "super", letterSpacing: 0 }}>$</sup>
              {p.max}
              <sub style={{ fontSize: 13, fontWeight: 400, color: "var(--ghost)", verticalAlign: "baseline" }}>/mo</sub>
            </div>
            <div style={{ fontSize: 11, color: "var(--ghost)", marginBottom: 20 }}>
              {billing === "annual" ? "$1,428 billed annually" : "Switch to annual to save 20%"}
            </div>
            <Link href="/login" style={{
              display: "block", width: "100%", padding: "10px 16px",
              borderRadius: 8, textAlign: "center",
              background: "#F5A623", color: "#0A0E1A",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
              boxSizing: "border-box",
            }}>
              Start Max trial
            </Link>
          </div>

        </div>
      </>
    );
  }
  ```

- [ ] **Step 4: Run tests — expect them to PASS**

  ```bash
  cd frontend
  npm test -- --testPathPattern=BillingToggle --no-coverage 2>&1 | tail -20
  ```

  Expected: `PASS __tests__/BillingToggle.test.tsx` · 4 tests passing.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/app/pricing/BillingToggle.tsx frontend/__tests__/BillingToggle.test.tsx
  git commit -m "feat: add BillingToggle client component with annual/monthly pricing"
  ```

---

## Task 3: Pricing page (server component)

**Files:**
- Create: `frontend/app/pricing/page.tsx`
- Create: `frontend/__tests__/pricing.test.tsx`

### Context

`page.tsx` is a server component. It imports `BillingToggle` from `./BillingToggle` — Next.js automatically handles the server/client boundary. The feature table is static HTML; no client logic needed there. The Pro column uses per-cell background to create the tint effect (no `<colgroup>` background — inconsistent browser support).

Responsive rules:
- Cards: handled inside `BillingToggle` (single column below 640px via CSS)
- Feature table: wraps in `overflow-x: auto` container for mobile scroll

- [ ] **Step 1: Write the failing tests**

  Create `frontend/__tests__/pricing.test.tsx`:

  ```tsx
  import React from "react";
  import { render, screen } from "@testing-library/react";

  // BillingToggle uses useState — mock it so the server component test stays simple
  jest.mock("../app/pricing/BillingToggle", () => ({
    BillingToggle: () => <div data-testid="billing-toggle" />,
  }));

  import PricingPage from "../app/pricing/page";

  describe("PricingPage", () => {
    it("renders the hero headline", () => {
      render(<PricingPage />);
      expect(screen.getByText("Invest with intelligence")).toBeInTheDocument();
    });

    it("renders the BillingToggle island", () => {
      render(<PricingPage />);
      expect(screen.getByTestId("billing-toggle")).toBeInTheDocument();
    });

    it("renders all four feature section headers", () => {
      render(<PricingPage />);
      expect(screen.getByText("Signal Engine")).toBeInTheDocument();
      expect(screen.getByText("Portfolio")).toBeInTheDocument();
      expect(screen.getByText("Broker & Integrations")).toBeInTheDocument();
      expect(screen.getByText("Support")).toBeInTheDocument();
    });

    it("renders feature rows for both Free and Pro columns", () => {
      render(<PricingPage />);
      expect(screen.getByText("Autonomous trading")).toBeInTheDocument();
      expect(screen.getByText("Backtesting engine")).toBeInTheDocument();
      expect(screen.getByText("Interactive Brokers (IBKR)")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run tests — expect them to FAIL**

  ```bash
  cd frontend
  npm test -- --testPathPattern=pricing.test --no-coverage 2>&1 | tail -20
  ```

  Expected: `FAIL __tests__/pricing.test.tsx` — module not found.

- [ ] **Step 3: Create the pricing page**

  Create `frontend/app/pricing/page.tsx`:

  ```tsx
  import React from "react";
  import { BillingToggle } from "./BillingToggle";

  // ─── Feature data ──────────────────────────────────────────────────────────────

  type Cell = "✓" | "—" | string;

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
        { name: "AI-generated signals",         desc: "Multi-agent analysis on every ticker", free: "✓", pro: "✓", max: "✓" },
        { name: "Advisory mode",                desc: "Signals surfaced for your review",     free: "✓", pro: "✓", max: "✓" },
        { name: "Autonomous trading",           desc: "Atlas executes trades automatically",  free: "—", pro: "✓", max: "✓" },
        { name: "Guardrail confidence threshold",desc: "Hold trades below your confidence floor", free: "—", pro: "✓", max: "✓" },
      ],
    },
    {
      title: "Portfolio",
      features: [
        { name: "Ticker watchlist",             free: "5 tickers",  pro: "Unlimited", max: "Unlimited" },
        { name: "Equity curve & P&L tracking",  free: "✓", pro: "✓", max: "✓" },
        { name: "Decision log (AI reasoning)",  desc: "Full audit trail of every signal", free: "—", pro: "✓", max: "✓" },
        { name: "Backtesting engine",           desc: "Test strategies on historical data", free: "—", pro: "✓", max: "✓" },
      ],
    },
    {
      title: "Broker & Integrations",
      features: [
        { name: "Alpaca (paper & live)",        free: "✓", pro: "✓", max: "✓" },
        { name: "Interactive Brokers (IBKR)",   free: "—", pro: "—", max: "✓" },
        { name: "OAuth broker connect",         desc: "One-click broker authentication", free: "—", pro: "—", max: "✓" },
      ],
    },
    {
      title: "Support",
      features: [
        { name: "Email support",                free: "✓",        pro: "Priority", max: "Priority" },
        { name: "Onboarding call",              free: "—",        pro: "—",        max: "✓" },
      ],
    },
  ];

  // ─── Helpers ───────────────────────────────────────────────────────────────────

  function CellValue({ value, col }: { value: Cell; col: "free" | "pro" | "max" }) {
    const color =
      value === "✓"  ? (col === "free" ? "var(--bull)" : col === "pro" ? "#7B61FF" : "#F5A623") :
      value === "—"  ? "#2a3a50" :
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
          .pr-section-row td { background: var(--deep, #080d18); }
          .pr-section-row td.pr-pro-col { background: rgba(123,97,255,0.06); }
          .pr-feat-row td { background: var(--surface); border-bottom: 1px solid rgba(255,255,255,0.04); }
          .pr-feat-row:last-child td { border-bottom: none; }
          .pr-feat-row td.pr-pro-col { background: rgba(123,97,255,0.04); }

          @media (max-width: 639px) {
            .pr-cards-wrap { grid-template-columns: 1fr !important; }
            .pr-cards-wrap > * { border-radius: 14px !important; border: 1px solid var(--line) !important;
                                  border-left: 1px solid var(--line) !important;
                                  border-right: 1px solid var(--line) !important;
                                  transform: none !important; }
          }
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
                {/* Column header row */}
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <th style={{
                      width: "46%", padding: "14px 20px", textAlign: "left",
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "1px", color: "var(--ghost)",
                      background: "var(--surface)",
                    }}>Features</th>
                    {(["Free", "Pro", "Max"] as const).map((tier) => (
                      <th key={tier} className={tier === "Pro" ? "pr-pro-col" : undefined} style={{
                        width: "18%", padding: "14px 16px", textAlign: "center",
                        fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "1px",
                        color: tier === "Pro" ? "#7B61FF" : tier === "Max" ? "#F5A623" : "var(--ghost)",
                        background: tier === "Pro" ? "rgba(123,97,255,0.06)" : "var(--surface)",
                      }}>{tier}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {SECTIONS.map((section) => (
                    <React.Fragment key={section.title}>
                      {/* Section header */}
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
                        <td className="pr-section-row" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} />
                        <td className="pr-pro-col" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} />
                        <td style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} />
                      </tr>

                      {/* Feature rows */}
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
  ```

- [ ] **Step 4: Run tests — expect them to PASS**

  ```bash
  cd frontend
  npm test -- --testPathPattern=pricing.test --no-coverage 2>&1 | tail -20
  ```

  Expected: `PASS __tests__/pricing.test.tsx` · 4 tests passing.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

  ```bash
  cd frontend
  npm test -- --no-coverage 2>&1 | tail -30
  ```

  Expected: all existing tests still passing.

- [ ] **Step 6: Verify the build**

  ```bash
  cd frontend
  npm run build 2>&1 | tail -20
  ```

  Expected: `✓ Compiled successfully`. Confirm `/pricing` appears in the route list.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/app/pricing/page.tsx frontend/__tests__/pricing.test.tsx
  git commit -m "feat: add /pricing page (Free/Pro/Max tiers with feature comparison table)"
  ```
