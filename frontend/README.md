# Atlas — Frontend

Next.js 16 dashboard for the Atlas AI trading assistant. Deployed on Vercel (UAT).

## Stack

- **Framework** — Next.js 16 (App Router)
- **Language** — TypeScript
- **Styling** — Tailwind CSS v4 + CSS custom properties (semantic colour tokens)
- **Fonts** — Syne (headings), JetBrains Mono (data/labels), Nunito Sans (body)
- **Theme** — Dark by default via `ThemeProvider`; token-driven colours (`--bull`, `--bear`, `--hold`, `--dim`, etc.)

## Pages

### `/` — Landing
Fully styled marketing page. Ticker tape animation, execution mode explainer (advisory / conditional / autonomous), links to dashboard and admin.

### `/dashboard` — User Dashboard
Four-tab layout. Calls live backend APIs on mount.

| Tab | What it shows | API call |
|-----|---------------|----------|
| Overview | Portfolio summary card, latest signal, open positions snapshot | `/v1/portfolio` |
| Signals | Full signal list with confidence bars, risk params, approve/reject buttons | `/v1/signals` |
| Positions | Open positions table with unrealised P&L | `/v1/portfolio` |
| Settings | Theme toggle, execution mode selector (local state) | — |

Signal approval calls `POST /v1/signals/{id}/approve` and re-fetches the signal list. Error states are handled with a fallback UI.

### `/admin` — Admin Panel
Desktop-first sidebar layout. Used to trigger pipeline runs manually.

- Run pipeline: `POST /v1/pipeline/run` with ticker + boundary mode
- Pipeline run table (mock data — not yet wired to MongoDB)
- System status panel showing API endpoint, Gemini model, broker
- Env config display

## Components

| Component | Purpose |
|-----------|---------|
| `components/ThemeProvider.tsx` | Context provider that exposes `theme` + `toggleTheme`; applies `data-theme` attribute to `<html>` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g. `https://atlas-broker-backend-uat.onrender.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (safe for browser) |

> `SUPABASE_SERVICE_KEY` is backend-only. Never set it here.

## Commands

```bash
npm install
cp .env.example .env.local
npm run dev      # → http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
```

## Deployment

Connect to Vercel, set root directory to `frontend/`, add env vars in the Vercel dashboard. `NEXT_PUBLIC_API_URL` must point to the deployed backend before API calls will work.

UAT: `https://atlas-broker-frontend-uat.vercel.app`
