# Atlas Frontend Redesign — Design Spec
**Date:** 2026-03-20
**Status:** Approved for implementation
**Approach:** Parallel streams (Stream A: tokens + design system · Stream B: user dashboard · Stream C: admin + backend)

---

## 1. Context

Atlas is an AI-powered paper trading platform. The redesign pushes the product toward its core vision: **autonomous AI trading with minimal cognitive burden on the user**. The interface should answer one question above all — *am I earning or losing?* — and then get out of the way.

Design direction: **B (light) + C (dark)**
- Light mode: clean whites, professional restraint (IBKR / Tiger Broker feel) — current light tokens unchanged
- Dark mode: midnight navy (`#0A0E1A`–`#131D2E`), gradient card surfaces, glowing signal accents

---

## 2. Design Tokens

### 2.1 Dark Mode Token Changes (`globals.css`)

| Token | Old | New |
|-------|-----|-----|
| `--bg` | `#07080B` | `#0A0E1A` |
| `--deep` | `#0C1016` | `#0D1321` |
| `--surface` | `#111820` | `#0F1829` |
| `--elevated` | `#182030` | `#131D2E` |
| `--line` | `#1C2B3A` | `#1E3050` |
| `--line2` | `#263D52` | `#2A4060` |
| `--ghost` | `#3D5060` | `#4A6080` |

Light mode tokens: **unchanged**.

### 2.2 New Tokens

```css
--tier-pro:  #7B61FF;   /* Pro badge — soft violet */
--tier-max:  #F5A623;   /* Max badge — gold (reuses --hold) */
```

### 2.3 New Global Utility Classes

- `.agent-timeline` — vertical reasoning chain container (border-left line with dot nodes)
- `.glow-bull`, `.glow-bear`, `.glow-brand` — existing, keep
- `.decision-log-row` — AI decision log entry row
- `.system-status-pill` — Online / Degraded / Offline indicator

---

## 3. Design System Page (`/design-system`)

Existing sections (Colors, Typography, Spacing, Buttons, Badges, Cards, Signals, Motion, Responsive) are kept and updated with new dark token values.

**New sections added:**

| Section | Components shown |
|---------|-----------------|
| Tier Badges | Free / Pro / Max chips with correct colors, with and without icons |
| AI Mode Strip | Slim autonomous status bar: philosophy name, active stock count, live dot |
| Signal Detail Card | Full signal card with BUY / SELL / HOLD glow variants + confidence bar |
| Agent Timeline | Vertical reasoning chain (Fundamental → Sentiment → Technical → Risk agents) |
| Equity Curve | Mini sparkline variant + full chart variant |
| Decision Log Row | BUY / HOLD / SELL log entry: action badge, timestamp, confidence bar, reason |
| Social Proof Bar | Avatar stack + "X users accepted" + acceptance % bar |
| System Status Pill | Online (green pulse) / Degraded (amber pulse) / Offline (red) |

---

## 4. User Dashboard

### 4.1 Navigation

- **Mobile:** Bottom tab bar — Portfolio · Signals · Backtest · Settings
- **Desktop:** Left sidebar — same 4 items

### 4.2 Tab 1 — Portfolio (Home)

**Header: Split Cards**
- Left card: **Total Value** — all-time figure, tappable → All-time Equity Curve page
- Right card: **Today's Return** — coloured green/red with glow, tappable → Intraday Equity Curve page
- Below header (Pro/Max only): **AI Mode Strip** — shows current philosophy (from `localStorage`), active positions count (from portfolio), live dot. Hidden for Free tier.

**Positions List**
- Each row: ticker, share count, P&L in colour (green/red/amber)
- Tappable → Stock AI Log page

**Drill-down: Equity Curve Page (shared component, two entry points)**
- Full-screen chart, time range toggle: 1D / 1W / 1M / All
- Key stats below chart: CAGR, Sharpe Ratio, Max Drawdown
- Back button returns to Portfolio

**Drill-down: Stock AI Log Page**
- Vertical timeline of every AI decision for the stock
- Each entry: action badge (BUY / HOLD / SELL) · timestamp · confidence bar · one-line reason
- Examples:
  - `BUY · 10:32 · 94% · "Breakout confirmed, earnings catalyst"`
  - `HOLD · 14:30 · 81% · "Momentum intact, maintaining position"`
  - `SELL · 15:45 · 87% · "Price target reached"`
- Shows last 5 entries by default; "Show all" expands
- Even HOLD decisions are logged — demonstrates AI is actively monitoring

### 4.3 Tab 2 — Signals

**List view:** Minimal rows — ticker + action badge + confidence + timestamp. Tap → Signal Detail page.

**Signal Detail Page (tap-through, Option C):**
- Large ticker + action badge with semantic glow
- Agent-by-agent reasoning chain as vertical timeline:
  - Fundamental Agent node
  - Sentiment Agent node
  - Technical Agent node
  - Risk Agent node (stop loss, take profit, position size, R:R ratio)
- **Free tier:** "Accept & Execute" button → manual broker order placement
- **Pro/Max in Autonomous/Guardrail:** shows "AI executed at HH:MM" or "Pending — guardrail held (58% < 65% threshold)"
- **Pro/Max in Advisory (paused):** shows "Accept & Execute" button (same as Free)

### 4.4 Tab 3 — Backtest

Existing `BacktestTab.tsx` retained. Restyled with updated navy dark tokens and upgraded equity curve component.

### 4.5 Tab 4 — Settings

| Setting | Free | Pro / Max |
|---------|------|-----------|
| Broker connection (Alpaca / IBKR) | ✓ | ✓ |
| Philosophy selector (Buffett / Soros / Lynch / Balanced) — DB values: `buffett`, `soros`, `lynch`, `balanced` | Upgrade prompt | ✓ |
| EBC Mode selector | Advisory only (locked) + upgrade prompt | ✓ All three modes |
| AI Watchlist manager | Upgrade prompt | ✓ Shows slot usage (e.g. "7 / 10") |
| Account info | ✓ | ✓ |

**EBC Mode semantics** (`conditional` mode is retired — removed from codebase):
- **Advisory** (`advisory`) — Free: only option; Pro/Max: pause switch. AI generates signals, user executes manually.
- **Autonomous + Guardrail** (`autonomous_guardrail`) — AI auto-executes; signals below 65% confidence held and user notified by email.
- **Autonomous** (`autonomous`) — AI auto-executes all signals; 5-minute override window.

**Guardrail email notification:** When guardrail holds a signal, Resend sends a transactional email to the user's Clerk email address containing: ticker, action, confidence score, brief reasoning snippet, and a deep-link to `/dashboard` (no approve-from-email flow in this iteration).

---

## 5. Admin Dashboard

### 5.1 Layout

- **Desktop-first:** Left sidebar, main content area, max-width 1280px
- **Mobile:** Collapsible top nav with hamburger

### 5.2 Sidebar Nav

- Overview
- Users
- System Status
- Roles *(superadmin only — hidden from admin)*

### 5.3 Page 1 — Overview

**Top row (4 stat cards):**
- Total Users (with sparkline trend)
- Tier breakdown: Free / Pro / Max counts
- Signals generated today
- Autonomous executions today

**Below (2-column):**
- Left: Recent pipeline runs (last 5) — status + timestamp + duration
- Right: System health summary — all services as status pills at a glance

### 5.4 Page 2 — Users

Searchable, filterable table:

| Column | Notes |
|--------|-------|
| Name | From Clerk |
| Email | From Clerk |
| Tier | Free / Pro / Max — editable by superadmin only |
| Role | user / admin / superadmin — editable by superadmin only |
| Joined | Date from `profiles.created_at` |
| Broker | Connected / Not connected (from `broker_connections` table) |

Action menu per row (superadmin only):
- Change tier (Free ↔ Pro ↔ Max)
- Change role (user / admin / superadmin)

Confirmation modal before applying any change.

### 5.5 Page 3 — System Status

Live status cards for each service:

| Service | Key metric shown |
|---------|-----------------|
| Pipeline | Last run time, success/fail, agent count |
| Scheduler | Next run (13:30 UTC), last fired, enabled/disabled toggle |
| Alpaca API | Connection status, last heartbeat |
| IBKR API | Connection status, last heartbeat |
| MongoDB | Connectivity, collection doc counts |
| Supabase | Connectivity, row counts for key tables |

Status pill values: **Online** (green pulse) · **Degraded** (amber pulse) · **Offline** (red).
Superadmin gets "Force run pipeline" button on the Pipeline card.

### 5.6 Page 4 — Roles *(superadmin only)*

Filtered table of admin + superadmin users. Allows role promotion/demotion.
Confirmation modal: *"You are granting superadmin access to [name]. This cannot be undone without superadmin privileges."*

---

## 6. Backend Changes

| Change | Type | Access | Notes |
|--------|------|--------|-------|
| Remove `conditional` boundary mode | Refactor | — | Delete from DB check constraint, `boundary/modes.py`, `boundary/controller.py`, frontend selectors. Existing rows stay as-is (display-only legacy). |
| `tier` column on `profiles` | DB migration | — | `'free' \| 'pro' \| 'max'`, default `'free'`. Include in `get_profile()` response. |
| `PATCH /v1/admin/users/:id/tier` | New API route | superadmin only | In `api/routes/admin.py`. Updates tier, returns updated profile. |
| `PATCH /v1/admin/users/:id/role` | Existing route | superadmin only | Already in `api/routes/users.py` — no change needed. |
| `GET /v1/admin/users` | New API route | admin + superadmin | Returns all users with `id, display_name, email, tier, role, created_at, broker_connected`. Email fetched from Clerk API using `CLERK_SECRET_KEY`. |
| `GET /v1/admin/stats` | New API route | admin + superadmin | Returns `{total_users, free_count, pro_count, max_count, signals_today, executions_today}`. `signals_today` from MongoDB `reasoning_traces` (UTC date filter). `executions_today` from Supabase `trades` where `executed_at >= today UTC AND status = 'executed'`. |
| `GET /v1/admin/system-status` | New API route | admin + superadmin | Pings all services, returns health object per service: `{pipeline, scheduler, alpaca, ibkr, mongodb, supabase}` each with `{status: 'online'\|'degraded'\|'offline', last_checked, detail}`. |
| `GET /v1/portfolio/equity-curve` | New API route | user | Calls Alpaca `/v2/account/portfolio/history?timeframe=1D`. Returns `{date, value}[]`. |
| `GET /v1/portfolio/positions/:ticker/log?limit=20` | New API route | user | Queries MongoDB `reasoning_traces` by `{user_id, ticker}` sorted by `created_at desc`. Returns `{action, confidence, reasoning, created_at}[]`. |
| Resend guardrail notification | New service | — | `backend/services/notification_service.py`. Triggered by boundary controller on `guardrail_triggered=True`. Fetches user email from Clerk API (`CLERK_SECRET_KEY`). Sends via `resend` Python SDK (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). Deep-link to `/dashboard`. |

---

## 7. Implementation Streams

### Stream A — Design Tokens + Design System Page
**Files:** `globals.css`, `app/design-system/page.tsx`
**Deliverable:** Updated dark tokens, new component sections on design system page

### Stream B — User Dashboard
**Files:** `app/dashboard/page.tsx`, `app/dashboard/BacktestTab.tsx`, new pages: `app/dashboard/equity-curve/page.tsx`, `app/dashboard/stock/[ticker]/page.tsx`, `app/dashboard/signal/[id]/page.tsx`
**Deliverable:** Full 4-tab dashboard with all drill-down pages

### Stream C — Admin Dashboard + Backend APIs
**Files:** `app/admin/page.tsx`, new backend routes in `api/routes/admin.py`, `api/routes/portfolio.py`, `services/notification_service.py`, DB migration
**Deliverable:** Admin 4-page dashboard, all new API endpoints, tier column migration, Resend integration

**New env vars required (backend):**
- `RESEND_API_KEY` — Resend API key
- `RESEND_FROM_EMAIL` — sender address (e.g. `noreply@atlas.ai`)
- `CLERK_SECRET_KEY` — already present; used to fetch user emails from Clerk API

---

## 8. Skills Applied

All implementation work should reference:
- `bencium-impact-designer` — production-grade component design
- `react-best-practices` — Next.js performance patterns
- `composition-patterns` — component architecture
- `typography` — type scale consistency
- `accesslint-contrast-checker` — WCAG contrast compliance on all new components
- `accesslint-use-of-color` — semantic color not used as sole indicator
- `web-design-guidelines` — accessibility audit on completion
- `frontend-design` — visual quality bar

---

## 9. Out of Scope

- Real money trading (paper trading only)
- Push notifications (email only for guardrail)
- Mobile native app
- Social following / copy trading
