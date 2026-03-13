# Atlas — Agents

LangGraph-based multi-agent trading pipeline. Imported by the backend as a local Python package during the capstone phase; designed to run as an independent background worker in production.

## Pipeline

```
Market Data (yfinance / Alpha Vantage)
    ↓
Analysis Team (runs concurrently)
  ├── Technical Analyst  — price action, indicators, chart patterns
  ├── Fundamental Analyst — financials, earnings, valuations
  └── Sentiment Analyst  — news, social media, market mood
    ↓
Synthesis Agent — bull/bear debate → unified trade thesis
    ↓
Risk Management Agent — position sizing, stop-loss, exposure limits
    ↓
Portfolio Decision Agent — final BUY/SELL/HOLD + reasoning trace
    ↓
Execution Boundary Controller (in backend)
```

## Stack

- **Orchestration** — LangGraph
- **LLM** — Google Gemini via `google-generativeai`
- **Memory** — MongoDB Atlas (layered: short / medium / long term)
- **Package manager** — uv

## Getting Started

```bash
uv sync
cp .env.example .env   # fill in GEMINI_API_KEY at minimum
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `LLM_QUICK_MODEL` | Fast model for data retrieval (default: `gemini-2.0-flash-lite`) |
| `LLM_DEEP_MODEL` | Deep model for analysis (default: `gemini-2.0-flash-lite`) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name (default: `atlas`) |
| `ALPHA_VANTAGE_API_KEY` | Market data (optional — yfinance used as fallback) |

## Upgrading LLM Models

No code changes needed. Just update the env vars:

```bash
LLM_QUICK_MODEL=gemini-2.5-flash
LLM_DEEP_MODEL=gemini-2.5-pro
```

## Module Structure

| Module | Description |
|--------|-------------|
| `orchestrator.py` | LangGraph pipeline coordinator |
| `analysts/technical.py` | Technical analysis agent |
| `analysts/fundamental.py` | Fundamental analysis agent |
| `analysts/sentiment.py` | Sentiment analysis agent |
| `llm/factory.py` | LLM provider factory — always use this, never call Gemini directly |
| `memory/` | Layered memory (short / medium / long term) |

## Academic References

- **TradingAgents** (arxiv 2412.20138) — analyst pipeline architecture
- **FinMem** (arxiv 2311.13743) — layered memory design
