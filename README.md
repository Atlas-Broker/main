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
| [`frontend/`](./frontend/) | Vercel | Next.js dashboard |
| [`backend/`](./backend/) | Render | FastAPI REST API |
| [`agents/`](./agents/) | (worker / imported by backend) | LangGraph multi-agent pipeline |
| [`database/`](./database/) | Supabase + MongoDB Atlas | Schema definitions |
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

## Tech Stack

- **Frontend** — Next.js 16, TypeScript, Tailwind CSS
- **Backend** — FastAPI, Python 3.11+, uv
- **Agents** — LangGraph, Google Gemini (Flash Lite / Flash)
- **Databases** — Supabase (PostgreSQL, RLS) + MongoDB Atlas (reasoning traces)
- **Brokers** — Alpaca (paper trading) → Interactive Brokers (production)

## Academic Context

Capstone project BAC3004 at Singapore Institute of Technology (Applied Computing Fintech).
- Interim report: 12 April 2026
- Final report: 19 July 2026
