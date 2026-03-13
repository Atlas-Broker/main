# Atlas — Frontend

Next.js 16 dashboard for the Atlas AI trading assistant. Deployed on Vercel (UAT).

## Stack

- **Framework** — Next.js 16 (App Router)
- **Language** — TypeScript
- **Styling** — Tailwind CSS v4
- **Fonts** — Syne (display/headings), JetBrains Mono (data and labels), Nunito Sans (body)

## Design

IBKR-adjacent dark theme with crimson `#C8102E` and void `#07080B`. Light mode with dark toggle is being added.

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run dev                  # → http://localhost:3000
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g. `https://your-service.onrender.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe to expose to browser) |

> Never put `SUPABASE_SERVICE_KEY` here — backend only.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — ticker tape, execution mode explainer |
| `/dashboard` | Mobile-first user view — 4 tabs: Overview, Signals, Positions, Settings. Currently reads from hardcoded stub data; API wiring in progress. |
| `/admin` | Desktop-first admin view — sidebar layout, runs the live pipeline via `POST /v1/pipeline/run` |

## Commands

```bash
npm run dev      # development server with hot reload
npm run build    # production build
npm run lint     # ESLint
```

## Deployment

Connect this repo to Vercel and set the root directory to `frontend/`. Add environment variables in the Vercel dashboard before deploying. `NEXT_PUBLIC_API_URL` must be set for pipeline calls from the admin page to work.
