# Atlas — Agents

Multi-agent trading pipeline. Installed as a local editable package (`atlas-agents`) and imported by the backend. The full pipeline is live.

## Pipeline

```
Market Data (yfinance)
    OHLCV — 90-day daily bars
    Fundamentals — P/E, EPS growth, debt/equity, analyst targets
    News — top 10 recent headlines
         ↓
Analysis Team  [parallel — LangGraph fan-out]
    ├── Technical Analyst   — RSI, 20/50-day SMA, price change %, volume trend
    ├── Fundamental Analyst — valuation, growth trajectory, analyst consensus
    └── Sentiment Analyst   — news headline tone, key themes
         ↓ (fan-in — synthesis waits for all three)
Synthesis Agent     — constructs bull case + bear case, delivers unified trade thesis
         ↓
Risk Management Agent  — 2% portfolio risk rule → position size, stop-loss, take-profit (2:1 R/R)
         ↓
Portfolio Decision Agent  — final BUY / SELL / HOLD + confidence score (0–1)
         ↓
MongoDB Atlas  — full reasoning trace saved per run
         ↓
[backend] Execution Boundary Controller
```

All LLM calls use `response_mime_type="application/json"` for structured output. Latency is tracked per node.

## Stack

- **Orchestration** — LangGraph `StateGraph` with `Annotated` dict reducer for parallel fan-out/fan-in
- **LLM** — Google Gemini 2.5 Flash via `google-genai` SDK (both quick-think and deep-think slots)
- **Market data** — yfinance (OHLCV, fundamentals, news)
- **Memory** — MongoDB Atlas (`reasoning_traces` collection)
- **Package manager** — uv

## Module Structure

| Module | Description |
|--------|-------------|
| `state.py` | `AgentState` TypedDict — shared graph state, `Annotated` reducer for parallel analyst outputs |
| `graph.py` | `StateGraph` definition — nodes, parallel edges, fan-in, compiled singleton |
| `orchestrator.py` | Entry points: `run_pipeline()` (sync) and `run_pipeline_async()` (async) |
| `data/market.py` | yfinance wrapper — `fetch_ohlcv()`, `fetch_info()`, `fetch_news()` |
| `analysts/technical.py` | RSI, SMA, trend, key price levels → Gemini Flash signal |
| `analysts/fundamental.py` | Valuation, growth, analyst targets → Gemini Flash signal |
| `analysts/sentiment.py` | News headline analysis → Gemini Flash sentiment score + themes |
| `synthesis/agent.py` | Bull/bear debate, unified trade thesis → Gemini Flash verdict |
| `risk/agent.py` | Deterministic: 2% risk rule, stop-loss from support or 5% fixed, 2:1 R/R take-profit |
| `portfolio/agent.py` | Final action + confidence score → Gemini Flash decision |
| `memory/trace.py` | Saves full pipeline run to MongoDB, returns `trace_id` |
| `llm/factory.py` | LLM provider factory — always use this, never call Gemini directly |

## Getting Started

```bash
uv sync
cp .env.example .env   # GEMINI_API_KEY and MONGODB_URI are required
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
| `LLM_QUICK_MODEL` | Model for analysts and synthesis (default: `gemini-2.5-flash`) |
| `LLM_DEEP_MODEL` | Model for portfolio decision (default: `gemini-2.5-flash`) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name (default: `atlas`) |

No code changes are needed to swap models — update env vars only.

## Academic References

- **TradingAgents** (arxiv 2412.20138) — parallel analyst pipeline architecture
- **FinMem** (arxiv 2311.13743) — layered memory design
