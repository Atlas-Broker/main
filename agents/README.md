# Atlas — Agents

Multi-agent trading pipeline using Google Gemini and yfinance. Imported by the backend as a local Python package during the capstone phase; designed to run as an independent background worker in production.

## Pipeline

```
Market Data (yfinance — OHLCV, fundamentals, news)
    ↓
Analysis Team (sequential in Phase 2, parallel in Phase 3)
  ├── Technical Analyst  — RSI, SMA, volume, price action
  ├── Fundamental Analyst — P/E, growth, valuation, analyst targets
  └── Sentiment Analyst  — recent news headlines
    ↓
Synthesis Agent — bull/bear debate → unified trade thesis
    ↓
Risk Management Agent — position sizing (2% risk rule), stop-loss, R/R ratio
    ↓
Portfolio Decision Agent — final BUY/SELL/HOLD + confidence score
    ↓
MongoDB Atlas — reasoning trace saved per pipeline run
    ↓
Execution Boundary Controller (in backend)
```

## Stack

- **LLM** — Google Gemini 2.5 Flash via `google-genai` SDK
- **Market data** — yfinance (90-day OHLCV, fundamentals, news)
- **Memory** — MongoDB Atlas (`reasoning_traces` collection)
- **Package manager** — uv

## Getting Started

```bash
uv sync
cp .env.example .env   # fill in GEMINI_API_KEY and MONGODB_URI at minimum
```

Run the pipeline directly:

```python
from agents.orchestrator import run_pipeline

signal = run_pipeline("AAPL", boundary_mode="advisory")
print(signal.action, signal.confidence, signal.trace_id)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `LLM_QUICK_MODEL` | Fast model for analysts (default: `gemini-2.5-flash`) |
| `LLM_DEEP_MODEL` | Deep model for synthesis and decisions (default: `gemini-2.5-flash`) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name (default: `atlas`) |

## Upgrading LLM Models

No code changes needed. Just update the env vars:

```bash
LLM_QUICK_MODEL=gemini-2.5-flash
LLM_DEEP_MODEL=gemini-2.5-pro
```

## Module Structure

| Module | Description |
|--------|-------------|
| `orchestrator.py` | Pipeline coordinator — entry point for all pipeline runs |
| `data/market.py` | yfinance wrapper — OHLCV, fundamentals, news |
| `analysts/technical.py` | Technical analysis agent (RSI, SMA, trend, key levels) |
| `analysts/fundamental.py` | Fundamental analysis agent (valuation, growth, analyst targets) |
| `analysts/sentiment.py` | Sentiment analysis agent (news headlines) |
| `synthesis/agent.py` | Synthesis agent — bull/bear debate, unified verdict |
| `risk/agent.py` | Risk agent — position sizing, stop-loss, take-profit |
| `portfolio/agent.py` | Portfolio decision agent — final action + confidence |
| `memory/trace.py` | MongoDB trace persistence — saves full pipeline run |
| `llm/factory.py` | LLM provider factory — always use this, never call Gemini directly |

## Academic References

- **TradingAgents** (arxiv 2412.20138) — analyst pipeline architecture
- **FinMem** (arxiv 2311.13743) — layered memory design
