# Atlas Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Atlas into a production-grade AI trading platform with three parallel workstreams: design tokens + design system page, user dashboard with drill-down pages, and admin dashboard with new backend APIs.

**Architecture:** Three independent streams executed in parallel. Stream A touches only CSS and the design-system page. Stream B rebuilds the user dashboard (`app/dashboard/`) and creates new drill-down pages. Stream C rebuilds the admin frontend and adds new backend routes/services. All streams share the same design token layer from Stream A — Stream A must complete before B and C apply the new dark tokens visually, but implementation can proceed in parallel using existing tokens.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, CSS custom properties (design tokens), FastAPI, Python 3.11, Supabase (PostgreSQL), MongoDB Atlas, Clerk (auth), Alpaca (broker), Resend (email)

**Spec:** `docs/superpowers/specs/2026-03-20-atlas-frontend-redesign-design.md`

---

## File Map

### Stream A
| Action | Path |
|--------|------|
| Modify | `frontend/app/globals.css` |
| Modify | `frontend/app/design-system/page.tsx` |

### Stream B
| Action | Path |
|--------|------|
| Modify | `frontend/app/dashboard/page.tsx` |
| Create | `frontend/app/dashboard/equity-curve/page.tsx` |
| Create | `frontend/app/dashboard/stock/[ticker]/page.tsx` |
| Create | `frontend/app/dashboard/signal/[id]/page.tsx` |
| Modify | `frontend/app/dashboard/BacktestTab.tsx` (minor restyle) |
| Modify | `frontend/lib/api.ts` (add tier to UserProfile, equity curve + log fetchers) |

### Stream C — Backend
| Action | Path |
|--------|------|
| Create | `database/supabase/supabase/migrations/20260320200000_tier_and_remove_conditional.sql` |
| Modify | `backend/db/supabase.py` (add `get_user_tier`) |
| Modify | `backend/services/profile_service.py` (return tier in profile) |
| Modify | `backend/boundary/modes.py` (remove conditional) |
| Modify | `backend/boundary/controller.py` (remove conditional branch) |
| Create | `backend/api/routes/admin.py` |
| Modify | `backend/api/routes/portfolio.py` (add equity-curve + ticker log) |
| Create | `backend/services/notification_service.py` |
| Modify | `backend/main.py` (register admin router) |
| Create | `backend/tests/test_admin_routes.py` |
| Create | `backend/tests/test_portfolio_new_routes.py` |
| Create | `backend/tests/test_notification_service.py` |

### Stream C — Frontend
| Action | Path |
|--------|------|
| Modify | `frontend/app/admin/page.tsx` |

---

## STREAM A — Design Tokens + Design System Page

### Task A1: Update dark mode tokens in globals.css

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Apply dark token changes**

In `frontend/app/globals.css`, replace the `html.dark` block tokens:

```css
html.dark {
  --bg:          #0A0E1A;   /* was #07080B */
  --deep:        #0D1321;   /* was #0C1016 */
  --surface:     #0F1829;   /* was #111820 */
  --elevated:    #131D2E;   /* was #182030 */
  --line:        #1E3050;   /* was #1C2B3A */
  --line2:       #2A4060;   /* was #263D52 */
  --ghost:       #4A6080;   /* was #3D5060 */

  --ink:         #E8EDF3;
  --dim:         #7A8FA0;

  --header-bg:   rgba(10,14,26,0.92);
  --nav-bg:      rgba(10,14,26,0.95);
  --card-shadow: none;

  --bull:        #00C896;
  --bear:        #FF2D55;
  --hold:        #F5A623;
  --bull-bg:     rgba(0,200,150,0.12);
  --bear-bg:     rgba(255,45,85,0.12);
  --hold-bg:     rgba(245,166,35,0.12);
}
```

- [ ] **Step 2: Add tier tokens and new utility classes**

After the `:root` block, add tier tokens:

```css
/* ─── Tier tokens ────────────────────────────────────────────────────────── */
:root {
  --tier-pro: #7B61FF;   /* Pro badge — soft violet */
  --tier-max: #F5A623;   /* Max badge — gold (same as --hold) */
}
```

Add utility classes before the final `/* ─── Confidence bar` section:

```css
/* ─── Agent timeline ─────────────────────────────────────────────────────── */

.agent-timeline {
  display: flex;
  flex-direction: column;
  position: relative;
}

.agent-timeline-node {
  display: flex;
  gap: 12px;
  position: relative;
}

.agent-timeline-node::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 16px;
  bottom: -8px;
  width: 1px;
  background: var(--line);
}

.agent-timeline-node:last-child::before {
  display: none;
}

/* ─── Decision log row ───────────────────────────────────────────────────── */

.decision-log-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}

.decision-log-row:last-child {
  border-bottom: none;
}

/* ─── System status pill ─────────────────────────────────────────────────── */

.system-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.system-status-pill.online  { background: rgba(0,200,150,0.12); color: var(--bull); border: 1px solid rgba(0,200,150,0.3); }
.system-status-pill.degraded { background: rgba(245,166,35,0.12); color: var(--hold); border: 1px solid rgba(245,166,35,0.3); }
.system-status-pill.offline  { background: rgba(255,45,85,0.12);  color: var(--bear); border: 1px solid rgba(255,45,85,0.3);  }
```

- [ ] **Step 3: Verify build passes**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```
Expected: no CSS errors

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat: update dark mode tokens to midnight navy palette, add tier tokens and utility classes"
```

---

### Task A2: Add new sections to design-system page

**Files:**
- Modify: `frontend/app/design-system/page.tsx`

- [ ] **Step 1: Add Tier Badges section**

In `frontend/app/design-system/page.tsx`, add after the existing Badges section:

```tsx
{/* ── Tier Badges ── */}
<section>
  <h2 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", marginBottom: 16 }}>Tier Badges</h2>
  <div className="flex gap-3 flex-wrap">
    {[
      { label: "Free",  bg: "var(--elevated)", color: "var(--dim)",      border: "var(--line)" },
      { label: "Pro",   bg: "rgba(123,97,255,0.12)", color: "var(--tier-pro)", border: "rgba(123,97,255,0.3)" },
      { label: "Max",   bg: "rgba(245,166,35,0.12)", color: "var(--tier-max)", border: "rgba(245,166,35,0.3)" },
    ].map((t) => (
      <span key={t.label} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 12px", borderRadius: 20, fontSize: 12,
        fontFamily: "var(--font-mono)", fontWeight: 700,
        background: t.bg, color: t.color, border: `1px solid ${t.border}`,
        letterSpacing: "0.06em",
      }}>
        {t.label}
      </span>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Add AI Mode Strip section**

```tsx
{/* ── AI Mode Strip ── */}
<section>
  <h2 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", marginBottom: 16 }}>AI Mode Strip</h2>
  <div style={{
    background: "var(--elevated)", border: "1px solid var(--line)",
    borderRadius: 8, padding: "10px 16px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    maxWidth: 480,
  }}>
    <div className="flex items-center gap-2">
      <span className="live-dot" />
      <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)" }}>AUTONOMOUS · GUARDRAIL</span>
    </div>
    <div className="flex items-center gap-3">
      <span style={{ color: "var(--dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>Buffett</span>
      <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)" }}>4 stocks active</span>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add Signal Detail Card section**

```tsx
{/* ── Signal Detail Card ── */}
<section>
  <h2 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", marginBottom: 16 }}>Signal Detail Card</h2>
  <div style={{ maxWidth: 360 }}>
    {(["BUY", "SELL", "HOLD"] as const).map((action) => {
      const c = action === "BUY" ? "var(--bull)" : action === "SELL" ? "var(--bear)" : "var(--hold)";
      const bg = action === "BUY" ? "var(--bull-bg)" : action === "SELL" ? "var(--bear-bg)" : "var(--hold-bg)";
      return (
        <div key={action} style={{
          background: "var(--surface)", border: `1px solid ${c}40`,
          borderRadius: 12, padding: "16px 18px", marginBottom: 12,
        }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)" }}>NVDA</span>
            <span className="font-display font-bold" style={{ fontSize: 20, color: c }}>{action}</span>
          </div>
          <div className="conf-bar-track" style={{ marginBottom: 8 }}>
            <div className="conf-bar-fill" style={{ width: "88%", background: c }} />
          </div>
          <span style={{ color: c, fontSize: 12, fontFamily: "var(--font-mono)" }}>88%</span>
        </div>
      );
    })}
  </div>
</section>
```

- [ ] **Step 4: Add Agent Timeline section**

```tsx
{/* ── Agent Timeline ── */}
<section>
  <h2 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", marginBottom: 16 }}>Agent Timeline</h2>
  <div className="agent-timeline" style={{ maxWidth: 360, padding: "4px 0" }}>
    {[
      { label: "Fundamental Agent", text: "P/E 28x vs 5yr avg 42x — undervalued. FCF yield 3.2%.", dot: "var(--bull)" },
      { label: "Sentiment Agent",   text: "News sentiment 0.78/1.0. Institutional buying in 13F.", dot: "var(--bull)" },
      { label: "Technical Agent",   text: "RSI 58, above 20d SMA. Breakout confirmed.", dot: "var(--bull)" },
      { label: "Risk Agent",        text: "Stop −8%, target +22%. R:R 2.75. Size: $1,000.", dot: "var(--hold)" },
    ].map((node, i) => (
      <div key={i} className="agent-timeline-node" style={{ marginBottom: 12 }}>
        <div style={{ flexShrink: 0, marginTop: 4 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: node.dot, border: "2px solid var(--surface)" }} />
        </div>
        <div>
          <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
            {node.label}
          </div>
          <div style={{ color: "var(--dim)", fontSize: 13, fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            {node.text}
          </div>
        </div>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 5: Add Decision Log Row section**

```tsx
{/* ── Decision Log Row ── */}
<section>
  <h2 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", marginBottom: 16 }}>Decision Log Row</h2>
  <div style={{ maxWidth: 480, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "0 16px" }}>
    {[
      { action: "BUY",  conf: 94, time: "10:32", reason: "Breakout confirmed, earnings catalyst" },
      { action: "HOLD", conf: 81, time: "14:30", reason: "Momentum intact, maintaining position" },
      { action: "SELL", conf: 87, time: "15:45", reason: "Price target reached" },
    ].map((row, i) => {
      const c = row.action === "BUY" ? "var(--bull)" : row.action === "SELL" ? "var(--bear)" : "var(--hold)";
      return (
        <div key={i} className="decision-log-row">
          <span style={{
            flexShrink: 0, padding: "2px 8px", borderRadius: 4, fontSize: 11,
            fontFamily: "var(--font-mono)", fontWeight: 700, color: c,
            background: `${c}20`, border: `1px solid ${c}40`,
          }}>{row.action}</span>
          <div className="flex-1">
            <div style={{ color: "var(--dim)", fontSize: 13 }}>{row.reason}</div>
            <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
              {row.time} · {row.conf}%
            </div>
          </div>
          <div className="conf-bar-track" style={{ width: 60, flexShrink: 0, alignSelf: "center" }}>
            <div className="conf-bar-fill" style={{ width: `${row.conf}%`, background: c }} />
          </div>
        </div>
      );
    })}
  </div>
</section>
```

- [ ] **Step 6: Add System Status Pill section**

```tsx
{/* ── System Status Pill ── */}
<section>
  <h2 className="font-display font-bold" style={{ fontSize: 20, color: "var(--ink)", marginBottom: 16 }}>System Status Pill</h2>
  <div className="flex gap-3 flex-wrap">
    <span className="system-status-pill online"><span className="live-dot" style={{ width: 6, height: 6 }} />Online</span>
    <span className="system-status-pill degraded"><span className="live-dot" style={{ width: 6, height: 6, background: "var(--hold)" }} />Degraded</span>
    <span className="system-status-pill offline"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bear)", display: "inline-block", flexShrink: 0 }} />Offline</span>
  </div>
</section>
```

- [ ] **Step 7: Build and lint**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build && npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add frontend/app/design-system/page.tsx
git commit -m "feat: add Tier Badges, AI Mode Strip, Signal Detail, Agent Timeline, Decision Log, System Status sections to design-system page"
```

---

## STREAM B — User Dashboard

### Task B1: Update UserProfile type and add new API helpers

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `tier` to `UserProfile` type**

In `frontend/lib/api.ts`, find the `UserProfile` (or `UserRole` export) type and add `tier`:

```typescript
export type UserTier = "free" | "pro" | "max";

// In whatever type/interface stores the profile:
// add: tier: UserTier
```

- [ ] **Step 2: Add equity-curve and ticker log fetchers**

```typescript
export type EquityCurvePoint = { date: string; value: number };
export type DecisionLogEntry = {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  created_at: string;
};

export async function fetchEquityCurve(apiUrl: string): Promise<EquityCurvePoint[]> {
  const res = await fetchWithAuth(`${apiUrl}/v1/portfolio/equity-curve`);
  if (!res || !res.ok) return [];
  return res.json();
}

export async function fetchDecisionLog(apiUrl: string, ticker: string, limit = 20): Promise<DecisionLogEntry[]> {
  const res = await fetchWithAuth(`${apiUrl}/v1/portfolio/positions/${ticker}/log?limit=${limit}`);
  if (!res || !res.ok) return [];
  return res.json();
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat: add tier to UserProfile, add equity curve and decision log API helpers"
```

---

### Task B2: Redesign Portfolio tab — split cards + AI Mode Strip + positions

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

The existing dashboard has 5 tabs: overview, signals, positions, settings, backtest. The redesign collapses to 4 tabs: **Portfolio** (was overview+positions), **Signals**, **Backtest**, **Settings**. The Portfolio tab uses split header cards and a tappable positions list.

- [ ] **Step 1: Update tab definitions**

Replace the `Tab` type and `TABS` array:

```typescript
type Tab = "portfolio" | "signals" | "backtest" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "signals",   label: "Signals"   },
  { id: "backtest",  label: "Backtest"  },
  { id: "settings",  label: "Settings"  },
];
```

- [ ] **Step 2: Add tier state to main component**

In `UserDashboard`, add:

```typescript
const [tier, setTier] = useState<"free" | "pro" | "max">("free");
// In loadData(), after fetchMyProfile():
// if (profile?.tier) setTier(profile.tier);
```

- [ ] **Step 3: Build the PortfolioTab component**

Replace `OverviewTab` and `PositionsTab` with a single `PortfolioTab`:

```typescript
function AIModeStrip({ philosophy, positionCount }: { philosophy: string; positionCount: number }) {
  return (
    <div style={{
      background: "var(--elevated)", border: "1px solid var(--line)",
      borderRadius: 8, padding: "9px 14px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 12,
    }}>
      <div className="flex items-center gap-2">
        <span className="live-dot" />
        <span style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
          AI · AUTONOMOUS
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span style={{ color: "var(--dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
          {philosophy.charAt(0).toUpperCase() + philosophy.slice(1)}
        </span>
        <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
          {positionCount} active
        </span>
      </div>
    </div>
  );
}

function PortfolioTab({
  portfolio,
  tier,
  philosophy,
  onPositionClick,
}: {
  portfolio: Portfolio | null;
  tier: "free" | "pro" | "max";
  philosophy: string;
  onPositionClick: (ticker: string) => void;
}) {
  const router = useRouter();
  const pnlPos = portfolio ? portfolio.pnl_today >= 0 : true;

  return (
    <div className="flex flex-col gap-3 pb-6">
      {/* Split header cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Value */}
        <button
          onClick={() => router.push("/dashboard/equity-curve?range=all")}
          style={{
            background: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: 12, padding: "16px 14px", textAlign: "left",
            cursor: "pointer", boxShadow: "var(--card-shadow)",
          }}
        >
          <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-mono)", marginBottom: 6, letterSpacing: "0.06em" }}>TOTAL VALUE</div>
          <div className="num font-display font-bold" style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            {portfolio ? `$${(portfolio.total_value / 1000).toFixed(1)}k` : "—"}
          </div>
          <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-mono)", marginTop: 4 }}>tap for curve →</div>
        </button>

        {/* Today's Return */}
        <button
          onClick={() => router.push("/dashboard/equity-curve?range=1d")}
          style={{
            background: "var(--surface)", border: `1px solid ${pnlPos ? "var(--bull)" : "var(--bear)"}30`,
            borderRadius: 12, padding: "16px 14px", textAlign: "left",
            cursor: "pointer", boxShadow: pnlPos ? "0 0 14px rgba(0,200,150,0.08)" : "0 0 14px rgba(255,45,85,0.08)",
          }}
        >
          <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-mono)", marginBottom: 6, letterSpacing: "0.06em" }}>TODAY</div>
          <div className="num font-display font-bold" style={{ fontSize: 22, color: pnlPos ? "var(--bull)" : "var(--bear)", letterSpacing: "-0.02em" }}>
            {portfolio ? `${pnlPos ? "+" : ""}${fmt(portfolio.pnl_today)}` : "—"}
          </div>
          <div style={{ color: "var(--ghost)", fontSize: 9, fontFamily: "var(--font-mono)", marginTop: 4 }}>tap for chart →</div>
        </button>
      </div>

      {/* AI Mode Strip — Pro/Max only */}
      {(tier === "pro" || tier === "max") && portfolio && (
        <AIModeStrip philosophy={philosophy} positionCount={portfolio.positions.length} />
      )}

      {/* Positions list */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 10, letterSpacing: "0.06em" }}>POSITIONS</div>
        {!portfolio || portfolio.positions.length === 0 ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No open positions yet.</div>
        ) : (
          portfolio.positions.map((pos) => (
            <button
              key={pos.ticker}
              onClick={() => onPositionClick(pos.ticker)}
              style={{
                width: "100%", background: "var(--surface)", border: "1px solid var(--line)",
                borderRadius: 10, padding: "14px 16px", display: "flex",
                alignItems: "center", justifyContent: "space-between",
                cursor: "pointer", marginBottom: 8, textAlign: "left",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <div>
                <span className="font-display font-bold" style={{ fontSize: 16, color: "var(--ink)" }}>{pos.ticker}</span>
                <span className="num" style={{ color: "var(--ghost)", fontSize: 12, marginLeft: 8 }}>{pos.shares} shares</span>
              </div>
              <div className="text-right">
                <div className="num" style={{ color: pos.pnl >= 0 ? "var(--bull)" : "var(--bear)", fontSize: 14, fontWeight: 700 }}>
                  {pos.pnl >= 0 ? "+" : ""}{fmt(pos.pnl)}
                </div>
                <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginTop: 2 }}>AI log →</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire router-based navigation for positions**

In `UserDashboard`, handle position clicks:

```typescript
const router = useRouter();
function handlePositionClick(ticker: string) {
  router.push(`/dashboard/stock/${ticker}`);
}
```

Update the tab render section:

```tsx
{tab === "portfolio" && (
  <PortfolioTab
    portfolio={portfolio}
    tier={tier}
    philosophy={philosophy}
    onPositionClick={handlePositionClick}
  />
)}
```

- [ ] **Step 5: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat: redesign Portfolio tab with split value cards, AI Mode Strip, tappable positions list"
```

---

### Task B3: Redesign Signals tab — minimal list

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

The signals tab becomes a minimal list (ticker + action badge + confidence + time) where each row taps to a full detail page.

- [ ] **Step 1: Replace SignalsTab with minimal list**

```typescript
function SignalsTab({
  signals,
  loading,
}: {
  signals: Signal[];
  loading: boolean;
}) {
  const router = useRouter();
  const ACTION_COLOR = {
    BUY:  "var(--bull)",
    SELL: "var(--bear)",
    HOLD: "var(--hold)",
  } as const;

  if (loading) return (
    <div style={{ color: "var(--ghost)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>Loading signals…</div>
  );
  if (!signals.length) return (
    <div style={{ color: "var(--ghost)", fontSize: 13, padding: "32px 0", textAlign: "center" }}>No signals yet — run the pipeline from admin.</div>
  );

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
      {signals.map((sig, i) => {
        const c = ACTION_COLOR[sig.action];
        return (
          <button
            key={sig.id}
            onClick={() => router.push(`/dashboard/signal/${sig.id}`)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", background: "transparent", border: "none",
              borderBottom: i < signals.length - 1 ? "1px solid var(--line)" : "none",
              cursor: "pointer", textAlign: "left",
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11,
                fontFamily: "var(--font-mono)", fontWeight: 700,
                color: c, background: `${c}20`, border: `1px solid ${c}40`,
              }}>
                {sig.action}
              </span>
              <span className="font-display font-bold" style={{ fontSize: 16, color: "var(--ink)" }}>{sig.ticker}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="num" style={{ color: c, fontSize: 13, fontWeight: 600 }}>
                {Math.round(sig.confidence * 100)}%
              </span>
              <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                {relTime(sig.created_at)}
              </span>
              <span style={{ color: "var(--ghost)", fontSize: 12 }}>›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat: redesign Signals tab as minimal tap-to-detail list"
```

---

### Task B4: Create Equity Curve page

**Files:**
- Create: `frontend/app/dashboard/equity-curve/page.tsx`

- [ ] **Step 1: Create the file**

```typescript
// frontend/app/dashboard/equity-curve/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchEquityCurve, type EquityCurvePoint } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function sparkPath(points: EquityCurvePoint[], width: number, height: number): string {
  if (points.length < 2) return "";
  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map((p) => height - ((p.value - minV) / range) * height * 0.9 - height * 0.05);
  return xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
}

export default function EquityCurvePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("range") ?? "all";
  const [points, setPoints] = useState<EquityCurvePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEquityCurve(API_URL).then((data) => {
      setPoints(data);
      setLoading(false);
    });
  }, []);

  const last = points[points.length - 1];
  const first = points[0];
  const totalReturn = last && first ? ((last.value - first.value) / first.value) * 100 : 0;
  const positive = totalReturn >= 0;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", maxWidth: 520, margin: "0 auto" }}>
      {/* Header */}
      <header style={{
        background: "var(--header-bg)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)", padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20,
      }}>
        <button onClick={() => router.back()} style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--ghost)", fontSize: 20, padding: 0, lineHeight: 1,
        }}>←</button>
        <span className="font-display font-bold" style={{ fontSize: 17, color: "var(--ink)" }}>
          {rangeParam === "1d" ? "Today" : "All-Time"} Equity Curve
        </span>
      </header>

      <main style={{ padding: "24px 20px" }}>
        {loading ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", paddingTop: 48 }}>Loading…</div>
        ) : points.length === 0 ? (
          <div style={{ color: "var(--ghost)", fontSize: 13, textAlign: "center", paddingTop: 48 }}>No equity data yet.</div>
        ) : (
          <>
            {/* Return headline */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", marginBottom: 4 }}>TOTAL RETURN</div>
              <div className="num font-display font-bold" style={{
                fontSize: 42, letterSpacing: "-0.03em",
                color: positive ? "var(--bull)" : "var(--bear)",
              }}>
                {positive ? "+" : ""}{totalReturn.toFixed(2)}%
              </div>
            </div>

            {/* SVG chart */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: 12, padding: "16px", marginBottom: 24, overflow: "hidden",
            }}>
              <svg viewBox={`0 0 480 160`} style={{ width: "100%", height: "auto", display: "block" }}>
                <path
                  d={sparkPath(points, 480, 160)}
                  fill="none"
                  stroke={positive ? "var(--bull)" : "var(--bear)"}
                  strokeWidth={2}
                />
              </svg>
            </div>

            {/* Key stats */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)",
              borderRadius: 12, padding: "16px 20px",
            }}>
              <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 12, letterSpacing: "0.06em" }}>KEY STATS</div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Current", value: last ? `$${last.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—" },
                  { label: "Peak",    value: points.length ? `$${Math.max(...points.map(p => p.value)).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—" },
                  { label: "Days",    value: String(points.length) },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                    <div className="num" style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/equity-curve/page.tsx
git commit -m "feat: add equity curve drill-down page with SVG chart and key stats"
```

---

### Task B5: Create Stock AI Log page

**Files:**
- Create: `frontend/app/dashboard/stock/[ticker]/page.tsx`

- [ ] **Step 1: Create the file**

```typescript
// frontend/app/dashboard/stock/[ticker]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDecisionLog, type DecisionLogEntry } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function StockLogPage({ params }: { params: { ticker: string } }) {
  const router = useRouter();
  const ticker = params.ticker.toUpperCase();
  const [entries, setEntries] = useState<DecisionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchDecisionLog(API_URL, ticker, 20).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [ticker]);

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
```

- [ ] **Step 2: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/stock/
git commit -m "feat: add stock AI decision log drill-down page"
```

---

### Task B6: Create Signal Detail page

**Files:**
- Create: `frontend/app/dashboard/signal/[id]/page.tsx`

- [ ] **Step 1: Create the file**

The signal detail page fetches the full signal (including trace) from the existing `GET /v1/signals` list, finds the matching ID, and renders the agent reasoning chain.

```typescript
// frontend/app/dashboard/signal/[id]/page.tsx
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

export default function SignalDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    fetchWithAuth(`${API_URL}/v1/signals?limit=50`).then(async (res) => {
      if (!res) return;
      const list: Signal[] = await res.json();
      setSignal(list.find((s) => s.id === params.id) ?? null);
      setLoading(false);
    });
  }, [params.id]);

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
```

- [ ] **Step 2: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/signal/
git commit -m "feat: add signal detail page with agent reasoning chain and risk params"
```

---

### Task B7: Redesign Settings tab with tier-gated content

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Update SettingsTab to accept tier prop and gate features**

```typescript
export function SettingsTab({ tier }: { tier: "free" | "pro" | "max" }) {
  // ... existing state (dark, toggle, mode, philosophy, etc.)

  const isPro = tier === "pro" || tier === "max";

  // Tier badge at top
  const tierColors = {
    free: { bg: "var(--elevated)", color: "var(--dim)", border: "var(--line)" },
    pro:  { bg: "rgba(123,97,255,0.12)", color: "var(--tier-pro)", border: "rgba(123,97,255,0.3)" },
    max:  { bg: "rgba(245,166,35,0.12)", color: "var(--tier-max)", border: "rgba(245,166,35,0.3)" },
  };
  const tc = tierColors[tier];
```

In the return JSX, add the tier badge first, then gate the EBC modes and philosophy:

```tsx
{/* Tier badge */}
<div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px" }}>
  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 8, letterSpacing: "0.06em" }}>YOUR PLAN</div>
  <span style={{
    display: "inline-block", padding: "4px 14px", borderRadius: 20,
    fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700,
    background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
    letterSpacing: "0.06em",
  }}>
    {tier.toUpperCase()}
  </span>
</div>

{/* Execution mode — Pro/Max see all three; Free sees Advisory only with upgrade prompt */}
<div>
  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 10, letterSpacing: "0.06em" }}>EXECUTION MODE</div>
  {isPro ? (
    modes.map((m) => (/* existing mode buttons */))
  ) : (
    <>
      {/* Advisory row (active, locked) */}
      <div style={{ background: "var(--elevated)", border: "1px solid var(--dim)", borderRadius: 10, padding: "14px 18px", marginBottom: 8 }}>
        <div className="flex items-center justify-between">
          <span className="font-display font-bold" style={{ fontSize: 15, color: "var(--dim)" }}>Advisory</span>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--dim)" }} />
        </div>
        <p style={{ color: "var(--ghost)", fontSize: 13 }}>AI signals only. You execute manually.</p>
      </div>
      {/* Locked modes */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px", opacity: 0.5, cursor: "not-allowed" }}>
        <span style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-mono)" }}>🔒 Upgrade to Pro to unlock Autonomous modes</span>
      </div>
    </>
  )}
</div>

{/* Philosophy — Pro/Max only */}
<div>
  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 10, letterSpacing: "0.06em" }}>INVESTMENT PHILOSOPHY</div>
  {isPro ? (
    PHILOSOPHY_OPTIONS.map((p) => (/* existing philosophy buttons */))
  ) : (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px", opacity: 0.5 }}>
      <span style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-mono)" }}>🔒 Upgrade to Pro to select AI philosophy</span>
    </div>
  )}
</div>
```

- [ ] **Step 2: Pass tier to SettingsTab in render**

```tsx
{tab === "settings" && <SettingsTab tier={tier} />}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat: add tier badge and tier-gated EBC mode / philosophy selectors to Settings tab"
```

---

## STREAM C — Backend APIs

### Task C1: DB migration — add tier column, remove conditional mode

**Files:**
- Create: `database/supabase/supabase/migrations/20260320200000_tier_and_remove_conditional.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260320200000_tier_and_remove_conditional.sql

-- Add tier column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'pro', 'max'));

-- Update boundary_mode check constraint to remove 'conditional'
-- First drop the old constraint (name from initial schema)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_boundary_mode_check;

-- Re-add without 'conditional'
ALTER TABLE profiles
  ADD CONSTRAINT profiles_boundary_mode_check
  CHECK (boundary_mode IN ('advisory', 'autonomous', 'autonomous_guardrail'));

-- Migrate any existing 'conditional' rows to 'advisory' (safe fallback)
UPDATE profiles SET boundary_mode = 'advisory' WHERE boundary_mode = 'conditional';
```

- [ ] **Step 2: Push migration to Supabase**

```bash
cd /Users/whatelz/Documents/GitHub/main/database/supabase && supabase db push
```

Expected: migration applied, no errors

- [ ] **Step 3: Commit**

```bash
git add database/supabase/supabase/migrations/20260320200000_tier_and_remove_conditional.sql
git commit -m "feat: add tier column to profiles, remove conditional boundary_mode"
```

---

### Task C2: Remove conditional mode from Python backend

**Files:**
- Modify: `backend/boundary/modes.py`
- Modify: `backend/boundary/controller.py`
- Modify: `backend/api/routes/profile.py`

- [ ] **Step 1: Write tests first**

In `backend/tests/test_boundary_modes.py` (create or extend):

```python
from boundary.modes import get_mode_config, VALID_MODES

def test_conditional_mode_removed():
    assert "conditional" not in VALID_MODES

def test_three_valid_modes():
    assert set(VALID_MODES) == {"advisory", "autonomous", "autonomous_guardrail"}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_boundary_modes.py -v
```

Expected: FAIL (conditional still present)

- [ ] **Step 3: Update modes.py**

Remove `"conditional"` from `VALID_MODES` and any `conditional` branch in the mode config dict.

- [ ] **Step 4: Update controller.py**

Remove the `conditional` branch from any `if boundary_mode == "conditional"` blocks. The closest legacy equivalent is `advisory` (user executes manually).

- [ ] **Step 5: Update profile.py Literal type**

```python
class ProfileUpdate(BaseModel):
    boundary_mode: Literal["advisory", "autonomous", "autonomous_guardrail"] | None = None
    display_name: str | None = None
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_boundary_modes.py -v
```
Expected: PASS

- [ ] **Step 7: Run full suite**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest -v
```
Expected: all pass (any existing tests referencing `conditional` will need updating)

- [ ] **Step 8: Commit**

```bash
git add backend/boundary/ backend/api/routes/profile.py backend/tests/test_boundary_modes.py
git commit -m "feat: remove conditional boundary mode — three modes remain: advisory, autonomous_guardrail, autonomous"
```

---

### Task C3: Add tier to profile service

**Files:**
- Modify: `backend/db/supabase.py`
- Modify: `backend/services/profile_service.py`

- [ ] **Step 1: Write test**

In `backend/tests/test_profile_service.py`, add:

```python
def test_get_profile_includes_tier(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
        data={"id": "user1", "boundary_mode": "advisory", "display_name": "Test", "tier": "pro"}
    )
    profile = get_profile("user1")
    assert profile["tier"] == "pro"

def test_get_profile_defaults_tier_to_free(mock_supabase):
    mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = Mock(
        data={"id": "user1", "boundary_mode": "advisory", "display_name": "Test"}
    )
    profile = get_profile("user1")
    assert profile.get("tier", "free") == "free"
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_profile_service.py::test_get_profile_includes_tier -v
```

- [ ] **Step 3: Add get_user_tier to db/supabase.py**

```python
def get_user_tier(user_id: str) -> str:
    """Return the tier for the given user_id. Returns 'free' as safe default."""
    try:
        sb = get_supabase()
        result = (
            sb.table("profiles")
            .select("tier")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data and result.data.get("tier"):
            return result.data["tier"]
    except Exception:
        pass
    return "free"
```

- [ ] **Step 4: Update profile_service.py to include tier in SELECT**

In `get_profile()`, extend the Supabase select to include `tier`:

```python
result = (
    sb.table("profiles")
    .select("id, boundary_mode, display_name, tier")
    .eq("id", user_id)
    .maybe_single()
    .execute()
)
# In the returned dict, default tier to 'free' if absent:
data = result.data or {}
return {
    "id": data.get("id", user_id),
    "boundary_mode": data.get("boundary_mode", "advisory"),
    "display_name": data.get("display_name", ""),
    "tier": data.get("tier", "free"),
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_profile_service.py -v
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add backend/db/supabase.py backend/services/profile_service.py backend/tests/test_profile_service.py
git commit -m "feat: add tier to profile service and supabase helper"
```

---

### Task C4: New admin routes

**Files:**
- Create: `backend/api/routes/admin.py`
- Create: `backend/tests/test_admin_routes.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write tests**

Create `backend/tests/test_admin_routes.py`:

```python
from unittest.mock import patch, Mock
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

SUPERADMIN_HEADERS = {"Authorization": "Bearer fake-token"}

@pytest.fixture(autouse=True)
def mock_auth():
    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch") as m:
        async def fake_dispatch(request, call_next):
            request.state.user_id = "superadmin-user-1"
            return await call_next(request)
        m.side_effect = fake_dispatch
        yield

@pytest.fixture(autouse=True)
def mock_require_admin():
    with patch("api.dependencies.require_admin", return_value="superadmin-user-1"):
        with patch("api.dependencies.require_superadmin", return_value="superadmin-user-1"):
            yield

def test_get_admin_stats_returns_expected_shape():
    with patch("api.routes.admin.get_supabase") as mock_sb, \
         patch("api.routes.admin.get_mongo_collection") as mock_mongo:
        # Supabase mock: profiles table
        mock_sb.return_value.table.return_value.select.return_value.execute.return_value = Mock(
            data=[
                {"tier": "free"}, {"tier": "free"}, {"tier": "pro"}, {"tier": "max"},
            ]
        )
        # Mongo mock: reasoning_traces count
        mock_mongo.return_value.count_documents.return_value = 5
        response = client.get("/v1/admin/stats", headers=SUPERADMIN_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "total_users" in data
    assert "free_count" in data
    assert "signals_today" in data

def test_patch_user_tier_updates_correctly():
    with patch("api.routes.admin.get_supabase") as mock_sb:
        mock_sb.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"id": "user-123", "tier": "pro"}]
        )
        response = client.patch(
            "/v1/admin/users/user-123/tier",
            json={"tier": "pro"},
            headers=SUPERADMIN_HEADERS,
        )
    assert response.status_code == 200
    assert response.json()["tier"] == "pro"

def test_patch_user_tier_rejects_invalid_value():
    response = client.patch(
        "/v1/admin/users/user-123/tier",
        json={"tier": "enterprise"},
        headers=SUPERADMIN_HEADERS,
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run tests — expect fail (route doesn't exist)**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_admin_routes.py -v
```

- [ ] **Step 3: Create backend/api/routes/admin.py**

```python
# backend/api/routes/admin.py
"""
Admin-only API routes.
GET  /v1/admin/stats          — user counts by tier, signals today, executions today
GET  /v1/admin/users          — all users with tier, role, broker status
GET  /v1/admin/system-status  — health check for all services
PATCH /v1/admin/users/:id/tier — update a user's tier (superadmin only)
"""
import logging
import os
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import require_admin, require_superadmin
from db.supabase import get_supabase

router = APIRouter(prefix="/v1/admin", tags=["admin"])
logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _today_utc_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def get_mongo_collection(name: str):
    from db.mongo import get_mongo_db
    return get_mongo_db()[name]


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_admin_stats(_: str = Depends(require_admin)) -> dict:
    sb = get_supabase()
    profiles = sb.table("profiles").select("tier").execute()
    rows = profiles.data or []
    total = len(rows)
    free_count = sum(1 for r in rows if r.get("tier", "free") == "free")
    pro_count  = sum(1 for r in rows if r.get("tier") == "pro")
    max_count  = sum(1 for r in rows if r.get("tier") == "max")

    # Signals today — MongoDB reasoning_traces
    signals_today = 0
    try:
        col = get_mongo_collection("reasoning_traces")
        signals_today = col.count_documents({"created_at": {"$gte": _today_utc_start()}})
    except Exception as exc:
        logger.warning("MongoDB unavailable for signals_today count: %r", exc)

    # Executions today — Supabase trades
    executions_today = 0
    try:
        result = (
            sb.table("trades")
            .select("id", count="exact")
            .gte("executed_at", _today_utc_start())
            .eq("status", "executed")
            .execute()
        )
        executions_today = result.count or 0
    except Exception as exc:
        logger.warning("Supabase unavailable for executions_today count: %r", exc)

    return {
        "total_users": total,
        "free_count": free_count,
        "pro_count": pro_count,
        "max_count": max_count,
        "signals_today": signals_today,
        "executions_today": executions_today,
    }


# ─── Users list ───────────────────────────────────────────────────────────────

@router.get("/users")
def get_admin_users(_: str = Depends(require_admin)) -> list[dict]:
    """Return all users with tier, role, joined date, broker connection status."""
    sb = get_supabase()
    profiles_res = sb.table("profiles").select("id, tier, role, display_name, boundary_mode, created_at").execute()
    profiles = {p["id"]: p for p in (profiles_res.data or [])}

    # Broker connections
    broker_res = sb.table("broker_connections").select("user_id").execute()
    connected_ids = {r["user_id"] for r in (broker_res.data or [])}

    # Fetch emails from Clerk API
    clerk_emails: dict[str, str] = {}
    clerk_key = os.getenv("CLERK_SECRET_KEY", "")
    if clerk_key:
        try:
            resp = httpx.get(
                "https://api.clerk.com/v1/users",
                headers={"Authorization": f"Bearer {clerk_key}"},
                params={"limit": 500},
                timeout=5,
            )
            if resp.is_success:
                for u in resp.json():
                    primary = next((e["email_address"] for e in u.get("email_addresses", []) if e["id"] == u.get("primary_email_address_id")), "")
                    clerk_emails[u["id"]] = primary
        except Exception as exc:
            logger.warning("Clerk API unavailable: %r", exc)

    users = []
    for uid, p in profiles.items():
        users.append({
            "id": uid,
            "email": clerk_emails.get(uid, ""),
            "display_name": p.get("display_name", ""),
            "tier": p.get("tier", "free"),
            "role": p.get("role", "user"),
            "created_at": p.get("created_at", ""),
            "broker_connected": uid in connected_ids,
        })
    return users


# ─── Tier management ──────────────────────────────────────────────────────────

class TierUpdate(BaseModel):
    tier: Literal["free", "pro", "max"]


@router.patch("/users/{target_user_id}/tier")
def patch_user_tier(
    target_user_id: str,
    body: TierUpdate,
    _: str = Depends(require_superadmin),
) -> dict:
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .update({"tier": body.tier})
        .eq("id", target_user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    logger.info("Tier updated for user_id=%s → tier=%s", target_user_id, body.tier)
    return {"user_id": target_user_id, "tier": body.tier}


# ─── System status ────────────────────────────────────────────────────────────

def _pill(status: str, detail: str = "") -> dict:
    return {"status": status, "detail": detail}


@router.get("/system-status")
def get_system_status(_: str = Depends(require_admin)) -> dict:
    result: dict = {}

    # Supabase
    try:
        sb = get_supabase()
        sb.table("profiles").select("id").limit(1).execute()
        result["supabase"] = _pill("online")
    except Exception as exc:
        result["supabase"] = _pill("offline", str(exc)[:80])

    # MongoDB
    try:
        col = get_mongo_collection("reasoning_traces")
        count = col.count_documents({})
        result["mongodb"] = _pill("online", f"{count} traces")
    except Exception as exc:
        result["mongodb"] = _pill("offline", str(exc)[:80])

    # Alpaca
    try:
        from broker.factory import get_broker
        broker = get_broker()
        broker.get_account()
        result["alpaca"] = _pill("online")
    except Exception as exc:
        result["alpaca"] = _pill("degraded", str(exc)[:80])

    # Scheduler — read from scheduler state if available
    try:
        from services.scheduler_service import get_scheduler_status
        sched = get_scheduler_status()
        result["scheduler"] = _pill("online" if sched.get("enabled") else "degraded",
                                    f"next: {sched.get('next_run_utc', '?')}")
    except Exception as exc:
        result["scheduler"] = _pill("degraded", str(exc)[:80])

    # Pipeline — check last reasoning trace timestamp
    try:
        col = get_mongo_collection("reasoning_traces")
        latest = col.find_one({}, sort=[("created_at", -1)], projection={"created_at": 1})
        last_run = latest["created_at"] if latest else "never"
        result["pipeline"] = _pill("online", f"last: {last_run}")
    except Exception as exc:
        result["pipeline"] = _pill("degraded", str(exc)[:80])

    # IBKR — stub (not yet wired)
    result["ibkr"] = _pill("offline", "not configured")

    return result
```

- [ ] **Step 4: Register router in main.py**

```python
from api.routes.admin import router as admin_router
app.include_router(admin_router)
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_admin_routes.py -v
```

- [ ] **Step 6: Run full suite**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/api/routes/admin.py backend/tests/test_admin_routes.py backend/main.py
git commit -m "feat: add admin routes — stats, users list, tier management, system status"
```

---

### Task C5: Portfolio equity curve and ticker log endpoints

**Files:**
- Modify: `backend/api/routes/portfolio.py`
- Create: `backend/tests/test_portfolio_new_routes.py`

- [ ] **Step 1: Write tests**

```python
# backend/tests/test_portfolio_new_routes.py
from unittest.mock import patch, Mock
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_auth():
    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch") as m:
        async def fake_dispatch(request, call_next):
            request.state.user_id = "user-1"
            return await call_next(request)
        m.side_effect = fake_dispatch
        yield

def test_equity_curve_returns_date_value_list():
    mock_history = [
        {"timestamp": 1700000000, "equity": 100500.0},
        {"timestamp": 1700086400, "equity": 101200.0},
    ]
    with patch("api.routes.portfolio.get_broker") as mb:
        mb.return_value.get_portfolio_history.return_value = mock_history
        resp = client.get("/v1/portfolio/equity-curve", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert "date" in data[0]
    assert "value" in data[0]

def test_ticker_log_returns_decision_list():
    fake_traces = [
        {
            "pipeline_run": {"final_decision": {"action": "BUY", "confidence": 0.92, "reasoning": "Strong moat"}},
            "created_at": "2026-03-20T10:32:00Z",
        }
    ]
    with patch("api.routes.portfolio.get_mongo_collection") as mm:
        mm.return_value.find.return_value.sort.return_value.limit.return_value = fake_traces
        resp = client.get("/v1/portfolio/positions/NVDA/log", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["action"] == "BUY"
    assert data[0]["confidence"] == 0.92

def test_ticker_log_respects_limit_param():
    with patch("api.routes.portfolio.get_mongo_collection") as mm:
        mm.return_value.find.return_value.sort.return_value.limit.return_value = []
        resp = client.get("/v1/portfolio/positions/NVDA/log?limit=5", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    mm.return_value.find.return_value.sort.return_value.limit.assert_called_with(5)
```

- [ ] **Step 2: Run tests — expect fail**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_portfolio_new_routes.py -v
```

- [ ] **Step 3: Add endpoints to portfolio.py**

```python
# Add to backend/api/routes/portfolio.py

from datetime import datetime


def get_mongo_collection(name: str):
    from db.mongo import get_mongo_db
    return get_mongo_db()[name]


class EquityCurvePoint(BaseModel):
    date: str
    value: float


@router.get("/portfolio/equity-curve", response_model=list[EquityCurvePoint])
def get_equity_curve(user_id: str = Depends(get_current_user)):
    """Fetch portfolio history from Alpaca and return as date/value series."""
    try:
        from broker.factory import get_broker
        broker = get_broker()
        history = broker.get_portfolio_history()
        points = []
        for item in history:
            ts = item.get("timestamp") or item.get("t")
            val = item.get("equity") or item.get("v") or 0.0
            if ts:
                date_str = datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d")
                points.append(EquityCurvePoint(date=date_str, value=val))
        return points
    except Exception as exc:
        logger.exception("Failed to fetch equity curve from Alpaca")
        raise HTTPException(status_code=500, detail=str(exc))


class DecisionLogEntry(BaseModel):
    action: str
    confidence: float
    reasoning: str
    created_at: str


@router.get("/portfolio/positions/{ticker}/log", response_model=list[DecisionLogEntry])
def get_position_log(
    ticker: str,
    limit: int = 20,
    user_id: str = Depends(get_current_user),
):
    """Return AI decision log for a stock from MongoDB reasoning_traces."""
    try:
        col = get_mongo_collection("reasoning_traces")
        traces = (
            col.find(
                {"user_id": user_id, "ticker": ticker.upper()},
                {"pipeline_run.final_decision": 1, "created_at": 1},
            )
            .sort("created_at", -1)
            .limit(limit)
        )
        entries = []
        for doc in traces:
            decision = (doc.get("pipeline_run") or {}).get("final_decision") or {}
            entries.append(DecisionLogEntry(
                action=decision.get("action", "HOLD"),
                confidence=float(decision.get("confidence", 0.0)),
                reasoning=decision.get("reasoning", ""),
                created_at=doc.get("created_at", ""),
            ))
        return entries
    except Exception as exc:
        logger.exception("Failed to fetch decision log from MongoDB")
        raise HTTPException(status_code=500, detail=str(exc))
```

- [ ] **Step 4: Add `get_portfolio_history` to Alpaca broker adapter**

In `backend/broker/alpaca.py`, add:

```python
def get_portfolio_history(self, timeframe: str = "1D") -> list[dict]:
    """Fetch portfolio history from Alpaca."""
    resp = self._get("/v2/account/portfolio/history", params={"timeframe": timeframe, "extended_hours": False})
    timestamps = resp.get("timestamp", [])
    equities = resp.get("equity", [])
    return [{"timestamp": t, "equity": e} for t, e in zip(timestamps, equities) if e is not None]
```

Also add the abstract method to `backend/broker/base.py`:

```python
def get_portfolio_history(self, timeframe: str = "1D") -> list[dict]:
    raise NotImplementedError
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_portfolio_new_routes.py -v
```

- [ ] **Step 6: Full suite**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/api/routes/portfolio.py backend/broker/ backend/tests/test_portfolio_new_routes.py
git commit -m "feat: add equity-curve and position AI log endpoints to portfolio router"
```

---

### Task C6: Notification service — Resend guardrail email

**Files:**
- Create: `backend/services/notification_service.py`
- Create: `backend/tests/test_notification_service.py`

- [ ] **Step 1: Add resend to dependencies**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv add resend
```

- [ ] **Step 2: Write tests**

```python
# backend/tests/test_notification_service.py
from unittest.mock import patch, Mock
import pytest

@pytest.fixture
def mock_resend():
    with patch("services.notification_service.resend") as m:
        m.Emails.send.return_value = {"id": "test-email-id"}
        yield m

@pytest.fixture
def mock_clerk():
    with patch("services.notification_service._get_clerk_email") as m:
        m.return_value = "user@example.com"
        yield m

def test_send_guardrail_email_calls_resend(mock_resend, mock_clerk):
    from services.notification_service import send_guardrail_email
    send_guardrail_email(
        user_id="user-1",
        ticker="NVDA",
        action="BUY",
        confidence=0.58,
        reasoning="Breakout confirmed but below threshold",
    )
    assert mock_resend.Emails.send.called
    call_kwargs = mock_resend.Emails.send.call_args[1]
    assert "NVDA" in call_kwargs["subject"]
    assert "user@example.com" == call_kwargs["to"]

def test_send_guardrail_email_skips_when_no_email(mock_resend):
    with patch("services.notification_service._get_clerk_email", return_value=None):
        from services.notification_service import send_guardrail_email
        send_guardrail_email("user-1", "NVDA", "BUY", 0.58, "reason")
    assert not mock_resend.Emails.send.called

def test_get_clerk_email_returns_primary_email():
    with patch("services.notification_service.httpx.get") as mock_get:
        mock_get.return_value.is_success = True
        mock_get.return_value.json.return_value = {
            "primary_email_address_id": "eid-1",
            "email_addresses": [{"id": "eid-1", "email_address": "test@example.com"}],
        }
        from services.notification_service import _get_clerk_email
        email = _get_clerk_email("clerk-user-1")
    assert email == "test@example.com"
```

- [ ] **Step 3: Run tests — expect fail**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_notification_service.py -v
```

- [ ] **Step 4: Create notification_service.py**

```python
# backend/services/notification_service.py
"""
Guardrail notification service — sends transactional email via Resend
when the autonomous_guardrail boundary controller holds a signal.
"""
import logging
import os
import httpx
import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY   = os.getenv("RESEND_API_KEY", "")
RESEND_FROM      = os.getenv("RESEND_FROM_EMAIL", "noreply@atlas.ai")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
FRONTEND_URL     = os.getenv("NEXT_PUBLIC_APP_URL", "https://atlas.ai")

resend.api_key = RESEND_API_KEY


def _get_clerk_email(user_id: str) -> str | None:
    """Fetch the primary email for a Clerk user via Clerk's Backend API."""
    if not CLERK_SECRET_KEY:
        return None
    try:
        resp = httpx.get(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
            timeout=5,
        )
        if not resp.is_success:
            return None
        data = resp.json()
        primary_id = data.get("primary_email_address_id")
        for ea in data.get("email_addresses", []):
            if ea["id"] == primary_id:
                return ea["email_address"]
    except Exception as exc:
        logger.warning("Failed to fetch Clerk email for user_id=%s: %r", user_id, exc)
    return None


def send_guardrail_email(
    user_id: str,
    ticker: str,
    action: str,
    confidence: float,
    reasoning: str,
) -> None:
    """
    Send a guardrail hold notification to the user.
    Called by boundary controller when guardrail_triggered=True.
    """
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping guardrail email")
        return

    email = _get_clerk_email(user_id)
    if not email:
        logger.warning("No email found for user_id=%s — skipping guardrail email", user_id)
        return

    conf_pct = round(confidence * 100, 1)
    dashboard_url = f"{FRONTEND_URL}/dashboard"

    html_body = f"""
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#0D1117;font-size:20px;margin-bottom:4px;">
        Atlas AI — Guardrail held a signal
      </h2>
      <p style="color:#46606E;font-size:14px;">
        A signal for <strong>{ticker}</strong> was generated but held because
        confidence ({conf_pct}%) is below the 65% guardrail threshold.
      </p>
      <div style="background:#F4F6F9;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#46606E;font-size:12px;">TICKER</span>
          <strong style="color:#0D1117;">{ticker}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#46606E;font-size:12px;">ACTION</span>
          <strong style="color:#0D1117;">{action}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#46606E;font-size:12px;">CONFIDENCE</span>
          <strong style="color:#D97B00;">{conf_pct}%</strong>
        </div>
        <div style="margin-top:12px;">
          <span style="color:#46606E;font-size:12px;">REASONING</span>
          <p style="color:#0D1117;font-size:13px;margin:4px 0 0;">{reasoning}</p>
        </div>
      </div>
      <a href="{dashboard_url}" style="display:inline-block;background:#C8102E;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        View in Atlas →
      </a>
    </div>
    """

    try:
        resend.Emails.send(
            to=email,
            from_=RESEND_FROM,
            subject=f"Atlas: Guardrail held {ticker} {action} signal ({conf_pct}% confidence)",
            html=html_body,
        )
        logger.info("Guardrail email sent to user_id=%s ticker=%s", user_id, ticker)
    except Exception as exc:
        logger.error("Failed to send guardrail email: %r", exc)
```

- [ ] **Step 5: Wire into boundary controller**

In `backend/boundary/controller.py`, after the guardrail hold branch:

```python
if guardrail_triggered:
    # ... existing hold logic ...
    try:
        from services.notification_service import send_guardrail_email
        send_guardrail_email(
            user_id=user_id,
            ticker=ticker,
            action=action,
            confidence=confidence,
            reasoning=reasoning,
        )
    except Exception:
        pass  # non-fatal — never block execution for email failure
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_notification_service.py -v
```

- [ ] **Step 7: Full suite**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest -v
```

- [ ] **Step 8: Commit**

```bash
git add backend/services/notification_service.py backend/boundary/controller.py backend/tests/test_notification_service.py
git commit -m "feat: add Resend guardrail email notification service, wire into boundary controller"
```

---

### Task C7: Redesign Admin frontend — 4 pages

**Files:**
- Modify: `frontend/app/admin/page.tsx`

This is a complete rewrite of the admin page to support 4 sub-pages: Overview, Users, System Status, Roles.

- [ ] **Step 1: Define admin page types**

At the top of `frontend/app/admin/page.tsx`, add:

```typescript
type AdminPage = "overview" | "users" | "system" | "roles";

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  tier: "free" | "pro" | "max";
  role: "user" | "admin" | "superadmin";
  created_at: string;
  broker_connected: boolean;
};

type AdminStats = {
  total_users: number;
  free_count: number;
  pro_count: number;
  max_count: number;
  signals_today: number;
  executions_today: number;
};

type ServiceStatus = { status: "online" | "degraded" | "offline"; detail: string };
type SystemStatus = Record<string, ServiceStatus>;
```

- [ ] **Step 2: Overview page component**

```typescript
function OverviewPage({ stats, systemStatus }: { stats: AdminStats | null; systemStatus: SystemStatus | null }) {
  if (!stats) return <div style={{ color: "var(--ghost)", textAlign: "center", padding: "48px 0" }}>Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 800 }}>
        {[
          { label: "TOTAL USERS",       value: stats.total_users,      color: "var(--ink)" },
          { label: "FREE / PRO / MAX",  value: `${stats.free_count} / ${stats.pro_count} / ${stats.max_count}`, color: "var(--dim)" },
          { label: "SIGNALS TODAY",     value: stats.signals_today,    color: "var(--bull)" },
          { label: "EXECUTIONS TODAY",  value: stats.executions_today, color: "var(--brand)" },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 8, letterSpacing: "0.06em" }}>{s.label}</div>
            <div className="num font-display font-bold" style={{ fontSize: 32, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* System health summary */}
      {systemStatus && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", maxWidth: 800 }}>
          <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", marginBottom: 16, letterSpacing: "0.06em" }}>SYSTEM HEALTH</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(systemStatus).map(([svc, health]) => (
              <span key={svc} className={`system-status-pill ${health.status}`}>
                {health.status === "online" && <span className="live-dot" style={{ width: 6, height: 6 }} />}
                {health.status === "degraded" && <span className="live-dot" style={{ width: 6, height: 6, background: "var(--hold)" }} />}
                {health.status === "offline" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bear)", display: "inline-block" }} />}
                {svc}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Users page component**

```typescript
function UsersPage({
  users,
  currentRole,
  onTierChange,
  onRoleChange,
}: {
  users: AdminUser[];
  currentRole: string | null;
  onTierChange: (userId: string, tier: "free" | "pro" | "max") => void;
  onRoleChange: (userId: string, role: "user" | "admin" | "superadmin") => void;
}) {
  const [search, setSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ userId: string; field: string; value: string } | null>(null);

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const isSuperadmin = currentRole === "superadmin";

  const tierColors = {
    free: "var(--dim)", pro: "var(--tier-pro)", max: "var(--tier-max)",
  } as const;

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        style={{
          width: "100%", maxWidth: 400, padding: "10px 14px",
          background: "var(--surface)", border: "1px solid var(--line)",
          borderRadius: 8, color: "var(--ink)", fontSize: 13,
          fontFamily: "var(--font-mono)", marginBottom: 16, outline: "none",
        }}
      />

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              {["Name / Email", "Tier", "Role", "Joined", "Broker", ""].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: "0.06em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user, i) => (
              <tr key={user.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--line)" : "none" }}>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{user.display_name || "—"}</div>
                  <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{user.email}</div>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: 12, fontSize: 11,
                    fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: tierColors[user.tier],
                    background: `${tierColors[user.tier]}20`,
                    border: `1px solid ${tierColors[user.tier]}40`,
                  }}>
                    {user.tier.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{user.role}</span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                    {user.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ color: user.broker_connected ? "var(--bull)" : "var(--ghost)", fontSize: 12 }}>
                    {user.broker_connected ? "✓" : "—"}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  {isSuperadmin && (
                    <div className="flex gap-2">
                      <select
                        value={user.tier}
                        onChange={(e) => setConfirmModal({ userId: user.id, field: "tier", value: e.target.value })}
                        style={{
                          padding: "4px 8px", background: "var(--elevated)", border: "1px solid var(--line)",
                          borderRadius: 6, color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer",
                        }}
                      >
                        {["free", "pro", "max"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select
                        value={user.role}
                        onChange={(e) => setConfirmModal({ userId: user.id, field: "role", value: e.target.value })}
                        style={{
                          padding: "4px 8px", background: "var(--elevated)", border: "1px solid var(--line)",
                          borderRadius: 6, color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer",
                        }}
                      >
                        {["user", "admin", "superadmin"].map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation modal */}
      {confirmModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "28px 32px", maxWidth: 380 }}>
            <div className="font-display font-bold" style={{ fontSize: 18, color: "var(--ink)", marginBottom: 12 }}>Confirm change</div>
            <p style={{ color: "var(--dim)", fontSize: 14, marginBottom: 20 }}>
              Set {confirmModal.field} to <strong>{confirmModal.value}</strong> for this user?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (confirmModal.field === "tier") onTierChange(confirmModal.userId, confirmModal.value as "free" | "pro" | "max");
                  else onRoleChange(confirmModal.userId, confirmModal.value as "user" | "admin" | "superadmin");
                  setConfirmModal(null);
                }}
                style={{ flex: 1, padding: "10px 0", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ flex: 1, padding: "10px 0", background: "var(--elevated)", color: "var(--dim)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: System Status page component**

```typescript
function SystemStatusPage({ status }: { status: SystemStatus | null }) {
  if (!status) return <div style={{ color: "var(--ghost)", textAlign: "center", padding: "48px 0" }}>Loading…</div>;

  const serviceLabels: Record<string, string> = {
    pipeline: "Pipeline", scheduler: "Scheduler",
    alpaca: "Alpaca API", ibkr: "IBKR API",
    mongodb: "MongoDB", supabase: "Supabase",
  };

  return (
    <div className="grid grid-cols-1 gap-4" style={{ maxWidth: 700 }}>
      {Object.entries(status).map(([svc, health]) => (
        <div key={svc} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 22px" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-bold" style={{ fontSize: 16, color: "var(--ink)" }}>{serviceLabels[svc] ?? svc}</span>
            <span className={`system-status-pill ${health.status}`}>
              {health.status === "online"   && <span className="live-dot" style={{ width: 6, height: 6 }} />}
              {health.status === "degraded" && <span className="live-dot" style={{ width: 6, height: 6, background: "var(--hold)" }} />}
              {health.status === "offline"  && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bear)", display: "inline-block" }} />}
              {health.status}
            </span>
          </div>
          {health.detail && (
            <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-mono)" }}>{health.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Main admin page orchestrator**

Rewrite the main `AdminPage` default export to use left sidebar on desktop and the four sub-pages:

```typescript
export default function AdminDashboard() {
  const [page, setPage] = useState<AdminPage>("overview");
  const [role, setRole] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/login"); return; }
    async function load() {
      const profile = await fetchMyProfile();
      if (!profile || !["admin", "superadmin"].includes(profile.role ?? "")) {
        router.push("/dashboard"); return;
      }
      setRole(profile.role ?? null);
      const [statsRes, statusRes] = await Promise.all([
        fetchWithAuth(`${API}/v1/admin/stats`),
        fetchWithAuth(`${API}/v1/admin/system-status`),
      ]);
      if (statsRes?.ok) setStats(await statsRes.json());
      if (statusRes?.ok) setSystemStatus(await statusRes.json());
    }
    load();
  }, [isLoaded, isSignedIn]);

  async function loadUsers() {
    const res = await fetchWithAuth(`${API}/v1/admin/users`);
    if (res?.ok) setUsers(await res.json());
  }

  useEffect(() => {
    if (page === "users") loadUsers();
  }, [page]);

  async function handleTierChange(userId: string, tier: "free" | "pro" | "max") {
    await fetchWithAuth(`${API}/v1/admin/users/${userId}/tier`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, tier } : u));
  }

  async function handleRoleChange(userId: string, roleVal: "user" | "admin" | "superadmin") {
    await fetchWithAuth(`${API}/v1/users/${userId}/role`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: roleVal }),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: roleVal } : u));
  }

  const NAV_ITEMS: { id: AdminPage; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "users",    label: "Users" },
    { id: "system",   label: "System Status" },
    ...(role === "superadmin" ? [{ id: "roles" as AdminPage, label: "Roles" }] : []),
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0, background: "var(--surface)",
        borderRight: "1px solid var(--line)", padding: "24px 0",
        position: "sticky", top: 0, height: "100vh",
      }}>
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid var(--line)", marginBottom: 16 }}>
          <span className="font-display font-bold" style={{ fontSize: 16, color: "var(--ink)" }}>ATLAS ADMIN</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <button key={item.id} onClick={() => setPage(item.id)} style={{
            display: "block", width: "100%", textAlign: "left",
            padding: "10px 20px", background: page === item.id ? "var(--elevated)" : "transparent",
            border: "none", borderLeft: `2px solid ${page === item.id ? "var(--brand)" : "transparent"}`,
            color: page === item.id ? "var(--ink)" : "var(--ghost)",
            fontSize: 13, fontFamily: "var(--font-mono)", cursor: "pointer",
            fontWeight: page === item.id ? 600 : 400,
          }}>
            {item.label}
          </button>
        ))}
        <div style={{ position: "absolute", bottom: 20, left: 20 }}>
          <Link href="/dashboard" style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-mono)", textDecoration: "none" }}>
            ← Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: "32px", maxWidth: 1280, overflow: "auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 className="font-display font-bold" style={{ fontSize: 24, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            {NAV_ITEMS.find((n) => n.id === page)?.label}
          </h1>
        </div>

        {page === "overview" && <OverviewPage stats={stats} systemStatus={systemStatus} />}
        {page === "users"    && <UsersPage users={users} currentRole={role} onTierChange={handleTierChange} onRoleChange={handleRoleChange} />}
        {page === "system"   && <SystemStatusPage status={systemStatus} />}
        {page === "roles"    && role === "superadmin" && (
          <UsersPage
            users={users.filter((u) => u.role === "admin" || u.role === "superadmin")}
            currentRole={role}
            onTierChange={handleTierChange}
            onRoleChange={handleRoleChange}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Build and lint**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add frontend/app/admin/page.tsx
git commit -m "feat: redesign admin dashboard — 4-page sidebar layout (Overview, Users, System Status, Roles)"
```

---

## Final Verification

- [ ] **Run full backend test suite**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest -v --tb=short
```
Expected: all tests green, 80%+ coverage on new routes

- [ ] **Run full frontend build**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build
```
Expected: 0 errors, 0 type errors

- [ ] **Run frontend lint**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run lint
```

- [ ] **Final commit with summary**

```bash
git add -p
git commit -m "feat: complete Atlas frontend redesign — midnight navy tokens, 4-tab dashboard, admin portal, new API routes"
```

---

## Env Vars Checklist (add to Render backend)

| Var | Purpose |
|-----|---------|
| `RESEND_API_KEY` | Resend email service |
| `RESEND_FROM_EMAIL` | Sender address (e.g. `noreply@atlas.ai`) |
| `NEXT_PUBLIC_APP_URL` | Frontend URL for email deep-links (Vercel env var) |
