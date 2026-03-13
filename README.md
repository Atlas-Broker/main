# Atlas

> Agentic AI Support System for Investment and Trading

Atlas is a multi-agent AI trading assistant that lets you configure how much authority the AI has over trade execution — from pure signals to fully autonomous trading with human override.

## What Makes Atlas Different

Most retail AI trading tools are black boxes: they give you a signal or execute automatically, with no transparency into why. Atlas shows its reasoning at every step and lets you control the execution boundary:

| Mode | Behaviour |
|------|-----------|
| **Advisory** | AI generates signals — you execute manually |
| **Conditional** | AI proposes trades — you approve before execution |
| **Autonomous** | AI executes automatically — you have an override window |

The trading logic is identical across all three modes. Only the execution authority changes.

## Monorepo Structure

| Folder | Deploys to | Purpose |
|--------|-----------|---------|
| [`frontend/`](./frontend/) | Vercel (UAT) | Next.js 16 dashboard (App Router) |
| [`backend/`](./backend/) | Render (UAT) | FastAPI REST API |
| [`agents/`](./agents/) | Imported by backend | LangGraph multi-agent pipeline (Gemini + yfinance) |
| [`database/`](./database/) | Supabase + MongoDB Atlas | Schema definitions and migrations |
| [`docs/`](./docs/) | — | Architecture, context, plans |

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run dev      # → localhost:3000

# Backend
cd backend && uv sync && uv run uvicorn main:app --reload  # → localhost:8000
```

Copy `.env.example` files before running:
```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
cp agents/.env.example agents/.env
```

## Run the Agent Pipeline

```bash
# POST to the real pipeline — runs Gemini + yfinance end-to-end
curl -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "boundary_mode": "advisory"}'
```

Returns a real AI-generated signal with full risk parameters and a MongoDB trace ID.

## Tech Stack

- **Frontend** — Next.js 16, TypeScript, Tailwind CSS v4
- **Backend** — FastAPI, Python 3.11+, uv, Docker (deployed on Render)
- **Agents** — LangGraph (parallel fan-out), Google Gemini 2.5 Flash (`google-genai` SDK), yfinance
- **Databases** — Supabase (PostgreSQL + RLS, managed via Supabase CLI) + MongoDB Atlas (reasoning traces with JSON Schema validation)
- **Brokers** — Alpaca paper trading (connected); Interactive Brokers planned for production

## Current Status

The full agent pipeline is built and running:
- LangGraph parallel execution: technical, fundamental, and sentiment analysts run concurrently
- Execution Boundary Controller (EBC) with all 3 modes implemented
- Alpaca paper trading adapter connected
- Backend deployed on Render (UAT); frontend deployed on Vercel (UAT)
- Dashboard data wiring is in progress (currently reads from stub data)

## Academic Context

Capstone project BAC3004 at Singapore Institute of Technology (Applied Computing Fintech).
- Interim report: 12 April 2026
- Final report: 19 July 2026
