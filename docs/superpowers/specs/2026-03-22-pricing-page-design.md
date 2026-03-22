# Pricing Page Design Spec

## Goal

Add a `/pricing` page to the Atlas marketing site that communicates the Free / Pro / Max tier value proposition and drives sign-ups.

## Context

- Atlas uses Next.js 16 App Router with TypeScript and Tailwind CSS v4
- Design system: midnight navy dark mode with CSS custom properties (`--bg: #0A0E1A`, `--surface: #0F1829`, etc.)
- Tier colours: `--tier-pro: #7B61FF` (purple), `--tier-max: #F5A623` (amber)
- Auth: Clerk at `/login` — all CTA buttons link there
- No billing integration in this phase; prices are informational only
- `frontend/app/page.tsx` (landing page) still references retired `conditional` mode and `"Premium"` tier label — fix those as part of this work

## Layout

### 1. Hero
Centred, above the fold.
- Eyebrow: small all-caps label in `--tier-pro` colour
- Title: large bold headline ("Invest with intelligence")
- Subtitle: one-line description in muted text

### 2. Annual / Monthly toggle
Centred pill toggle, annual selected by default.
- "Save 20%" badge in `--bull` green beside the pill
- Switching toggle updates prices reactively (client component)

### 3. Pricing cards (3 columns)
One card per tier: Free, Pro, Max.
- **Pro card** elevated 6px, purple border, "Most popular" badge dropping from top edge
- **Max card** amber border, amber CTA button
- Each card: tier name, price (monthly equivalent), billing note, CTA button
- All CTA buttons link to `/login`
- Prices (placeholders until billing is configured):
  - Free: $0, no credit card
  - Pro: $49/mo monthly · $39/mo annual
  - Max: $149/mo monthly · $119/mo annual

### 4. Feature comparison table
Directly below the cards, same width, visually connected (no gap, shared border-radius on the bottom).
- Pro column has a subtle purple tint running the full height
- Rows grouped into sections: Signal Engine · Portfolio · Broker & Integrations · Support
- Each feature row: feature name + short description (left), then ✓ / — / limit text per tier column
- Feature set:

| Feature | Free | Pro | Max |
|---|---|---|---|
| **Signal Engine** | | | |
| AI-generated signals | ✓ | ✓ | ✓ |
| Advisory mode | ✓ | ✓ | ✓ |
| Autonomous trading | — | ✓ | ✓ |
| Guardrail confidence threshold | — | ✓ | ✓ |
| **Portfolio** | | | |
| Ticker watchlist | 5 tickers | Unlimited | Unlimited |
| Equity curve & P&L tracking | ✓ | ✓ | ✓ |
| Decision log (AI reasoning) | — | ✓ | ✓ |
| Backtesting engine | — | ✓ | ✓ |
| **Broker & Integrations** | | | |
| Alpaca (paper & live) | ✓ | ✓ | ✓ |
| Interactive Brokers (IBKR) | — | — | ✓ |
| OAuth broker connect | — | — | ✓ |
| **Support** | | | |
| Email support | ✓ | Priority | Priority |
| Onboarding call | — | — | ✓ |

## Landing page fix (in scope)

`frontend/app/page.tsx` — update the `MODES` array:
- Remove `conditional` mode entry
- Rename `"Premium"` tier label to `"Max"`

## Implementation notes

- Route: `frontend/app/pricing/page.tsx`
- Needs `"use client"` for the annual/monthly toggle state
- Follow existing CSS variable pattern from `globals.css` — no new Tailwind classes needed
- No new API calls; page is fully static

## Out of scope

- Stripe / billing integration
- Upgrade flow from within the dashboard
- Per-tier feature enforcement changes
