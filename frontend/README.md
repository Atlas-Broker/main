# Atlas — Frontend

Next.js 16 dashboard for the Atlas AI trading assistant.

## Stack

- **Framework** — Next.js 16 (App Router)
- **Language** — TypeScript
- **Styling** — Tailwind CSS v4
- **Fonts** — Geist (via `next/font`)

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
| `/` | Landing page |
| `/dashboard` | Main trading dashboard — portfolio, signals, positions |

## Commands

```bash
npm run dev      # development server with hot reload
npm run build    # production build
npm run lint     # ESLint
```

## Deployment

Connect this repo to Vercel and set the root directory to `frontend/`. Add environment variables in the Vercel dashboard before deploying.
