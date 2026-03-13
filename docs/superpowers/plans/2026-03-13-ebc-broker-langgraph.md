# EBC + Alpaca Broker + LangGraph + Backend Restructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the backend into layered modules, migrate the agent pipeline to LangGraph with parallel analyst execution, implement the Alpaca paper trading broker adapter, and wire in the Execution Boundary Controller (EBC) so all three modes (advisory/conditional/autonomous) are functionally distinct.

**Architecture:** FastAPI app with dedicated `api/routes/`, `broker/`, `boundary/`, and `services/` modules. Agents use a LangGraph `StateGraph` with parallel fan-out for the three analyst nodes. The EBC sits between the portfolio decision and broker execution — it routes the signal based on the configured mode.

**Tech Stack:** FastAPI, LangGraph 0.2+, alpaca-py, Pydantic v2, asyncio, Python 3.11+

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `agents/state.py` | `AgentState` TypedDict — shared graph state |
| `agents/graph.py` | LangGraph `StateGraph` definition with parallel analysts |
| `backend/api/__init__.py` | Package init |
| `backend/api/routes/__init__.py` | Package init |
| `backend/api/routes/pipeline.py` | `POST /v1/pipeline/run` route |
| `backend/api/routes/signals.py` | `GET /v1/signals`, approve/reject endpoints |
| `backend/api/routes/portfolio.py` | `GET /v1/portfolio` route |
| `backend/api/routes/trades.py` | `GET /v1/trades`, override endpoint |
| `backend/api/middleware/__init__.py` | Package init |
| `backend/api/middleware/cors.py` | CORS config helper |
| `backend/services/__init__.py` | Package init |
| `backend/services/pipeline_service.py` | Business logic — calls graph, calls EBC, returns response |
| `backend/broker/__init__.py` | Package init |
| `backend/broker/base.py` | `BrokerAdapter` Protocol |
| `backend/broker/alpaca.py` | `AlpacaAdapter` — paper trading implementation |
| `backend/broker/factory.py` | `get_broker()` — returns right adapter from env |
| `backend/boundary/__init__.py` | Package init |
| `backend/boundary/modes.py` | `BoundaryMode` enum + per-mode config |
| `backend/boundary/controller.py` | `EBC.execute()` — routes signal to advisory/conditional/autonomous path |

### Modified files

| File | Change |
|------|--------|
| `agents/orchestrator.py` | Thin wrapper — calls `graph.py` compiled graph, returns `AgentSignal` |
| `backend/main.py` | Slim down — create `FastAPI` app + include routers, keep keep-alive |
| `backend/pyproject.toml` | Add `alpaca-py>=0.8.0` |

---

## Chunk 1: Backend Restructure

Move existing route logic out of `main.py` into separate route modules. No new logic — just reorganization.

### Task 1: Add alpaca-py dependency

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add dependency**

```toml
[project]
name = "atlas-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "python-dotenv>=1.0.0",
    "httpx>=0.27.0",
    "pydantic>=2.0.0",
    "alpaca-py>=0.28.0",
]
```

- [ ] **Step 2: Install**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend
uv sync
```

Expected: resolves without errors.

---

### Task 2: Create `backend/api/` skeleton

**Files:**
- Create: `backend/api/__init__.py`
- Create: `backend/api/middleware/__init__.py`
- Create: `backend/api/middleware/cors.py`
- Create: `backend/api/routes/__init__.py`
- Create: `backend/services/__init__.py`

- [ ] **Step 1: Create package inits (all empty)**

```python
# backend/api/__init__.py  (empty)
# backend/api/routes/__init__.py  (empty)
# backend/api/middleware/__init__.py  (empty)
# backend/services/__init__.py  (empty)
```

- [ ] **Step 2: Create CORS middleware helper**

```python
# backend/api/middleware/cors.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def add_cors(app: FastAPI) -> None:
    origins = os.getenv("CORS_ORIGINS", "*").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
```

---

### Task 3: Extract signals route

**Files:**
- Create: `backend/api/routes/signals.py`

- [ ] **Step 1: Create signals route**

```python
# backend/api/routes/signals.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1", tags=["signals"])


class Signal(BaseModel):
    id: str
    ticker: str
    action: str
    confidence: float
    reasoning: str
    boundary_mode: str
    created_at: str


@router.get("/signals", response_model=list[Signal])
def get_signals():
    return [
        Signal(id="sig-001", ticker="AAPL", action="BUY", confidence=0.78,
               reasoning="Strong momentum with RSI divergence on weekly timeframe.",
               boundary_mode="advisory", created_at="2026-03-13T09:00:00Z"),
        Signal(id="sig-002", ticker="MSFT", action="HOLD", confidence=0.62,
               reasoning="Consolidating at key support zone.",
               boundary_mode="conditional", created_at="2026-03-12T14:30:00Z"),
    ]


@router.post("/signals/{signal_id}/approve")
def approve_signal(signal_id: str):
    return {"signal_id": signal_id, "status": "approved"}


@router.post("/signals/{signal_id}/reject")
def reject_signal(signal_id: str):
    return {"signal_id": signal_id, "status": "rejected"}
```

---

### Task 4: Extract portfolio + trades + override routes

**Files:**
- Create: `backend/api/routes/portfolio.py`
- Create: `backend/api/routes/trades.py`

- [ ] **Step 1: Create portfolio route**

```python
# backend/api/routes/portfolio.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1", tags=["portfolio"])


class Position(BaseModel):
    ticker: str
    shares: float
    avg_cost: float
    current_price: float
    pnl: float


class PortfolioSummary(BaseModel):
    total_value: float
    cash: float
    pnl_today: float
    pnl_total: float
    positions: list[Position]


@router.get("/portfolio", response_model=PortfolioSummary)
def get_portfolio():
    return PortfolioSummary(
        total_value=107340.50,
        cash=42180.00,
        pnl_today=1240.30,
        pnl_total=7340.50,
        positions=[
            Position(ticker="AAPL", shares=50, avg_cost=172.40, current_price=181.20, pnl=440.00),
            Position(ticker="NVDA", shares=20, avg_cost=820.00, current_price=882.50, pnl=1250.00),
        ],
    )
```

- [ ] **Step 2: Create trades route**

```python
# backend/api/routes/trades.py
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1", tags=["trades"])


class Trade(BaseModel):
    id: str
    ticker: str
    action: str
    shares: float
    price: float
    status: str
    executed_at: str


@router.get("/trades", response_model=list[Trade])
def get_trades():
    return [
        Trade(id="trd-001", ticker="TSLA", action="BUY", shares=10, price=248.50,
              status="filled", executed_at="2026-03-10T10:22:00Z"),
        Trade(id="trd-002", ticker="META", action="SELL", shares=15, price=612.80,
              status="filled", executed_at="2026-03-08T15:45:00Z"),
    ]


@router.post("/trades/{trade_id}/override")
def override_trade(trade_id: str):
    return {"trade_id": trade_id, "status": "override_requested"}
```

---

### Task 5: Slim down `main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Rewrite main.py to just wire everything together**

```python
# backend/main.py
import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI

from api.middleware.cors import add_cors
from api.routes import signals, portfolio, trades, pipeline

load_dotenv()

logger = logging.getLogger(__name__)

KEEP_ALIVE_INTERVAL = 10 * 60


async def _keep_alive_loop(base_url: str) -> None:
    async with httpx.AsyncClient() as client:
        while True:
            await asyncio.sleep(KEEP_ALIVE_INTERVAL)
            try:
                await client.get(f"{base_url}/health", timeout=10)
            except Exception as exc:
                logger.warning("Keep-alive ping failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    task = None
    if render_url:
        task = asyncio.create_task(_keep_alive_loop(render_url))
    yield
    if task:
        task.cancel()


app = FastAPI(title="Atlas API", version="0.1.0", docs_url="/docs", lifespan=lifespan)

add_cors(app)

app.include_router(signals.router)
app.include_router(portfolio.router)
app.include_router(trades.router)
app.include_router(pipeline.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
    }
```

Note: `pipeline.router` is created in the next chunk.

- [ ] **Step 2: Verify server starts**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend
uv run uvicorn main:app --reload
```

Expected: `Application startup complete.` — `GET /health` returns `{"status":"ok"}`.

- [ ] **Step 3: Commit**

```bash
git add backend/
git commit -m "refactor: restructure backend into api/routes, middleware, services modules"
```

---

## Chunk 2: LangGraph Migration

Replace the sequential orchestrator with a LangGraph `StateGraph`. Analysts run in parallel (fan-out), synthesis waits for all three (fan-in), then sequential: risk → portfolio → trace.

### Task 6: Create `agents/state.py`

**Files:**
- Create: `agents/state.py`

- [ ] **Step 1: Define shared graph state**

```python
# agents/state.py
"""
AgentState — the shared TypedDict passed between all LangGraph nodes.

Each node reads what it needs and writes only its own keys.
The `analyst_outputs` key uses a merge reducer so parallel analyst
nodes can each write their result without overwriting each other.
"""
from __future__ import annotations

import operator
from typing import Annotated, TypedDict


class AgentState(TypedDict):
    # Inputs
    ticker: str
    user_id: str
    boundary_mode: str

    # Market data (populated by fetch_data node)
    ohlcv: list[dict]
    info: dict
    news: list[dict]
    current_price: float

    # Analyst outputs — merged by operator.or_ so parallel nodes
    # can each add their key without race conditions
    analyst_outputs: Annotated[dict, operator.or_]

    # Sequential stage outputs
    synthesis: dict | None
    risk: dict | None
    portfolio_decision: dict | None
    trace_id: str | None
```

---

### Task 7: Create `agents/graph.py`

**Files:**
- Create: `agents/graph.py`

- [ ] **Step 1: Write the graph**

```python
# agents/graph.py
"""
LangGraph pipeline for Atlas.

Graph shape:
  fetch_data → [technical, fundamental, sentiment] (parallel) → synthesis → risk → portfolio → save_trace
"""
import asyncio

from langgraph.graph import StateGraph, START, END

from agents.state import AgentState
from agents.data import market
from agents.analysts import technical, fundamental, sentiment
from agents.synthesis import agent as synthesis_agent
from agents.risk import agent as risk_agent
from agents.portfolio import agent as portfolio_agent
from agents.memory import trace as trace_store


# ── Node functions ──────────────────────────────────────────────────────────
# Each node receives the full state and returns a dict of keys to update.

async def fetch_data(state: AgentState) -> dict:
    ticker = state["ticker"]
    ohlcv, info, news = await asyncio.gather(
        asyncio.to_thread(market.fetch_ohlcv, ticker),
        asyncio.to_thread(market.fetch_info, ticker),
        asyncio.to_thread(market.fetch_news, ticker),
    )
    current_price = info.get("currentPrice") or (ohlcv[-1]["close"] if ohlcv else 0.0)
    return {
        "ohlcv": ohlcv,
        "info": info,
        "news": news,
        "current_price": current_price,
        "analyst_outputs": {},
    }


async def run_technical(state: AgentState) -> dict:
    result = await asyncio.to_thread(technical.analyse, state["ticker"], state["ohlcv"])
    return {"analyst_outputs": {"technical": result}}


async def run_fundamental(state: AgentState) -> dict:
    result = await asyncio.to_thread(fundamental.analyse, state["ticker"], state["info"])
    return {"analyst_outputs": {"fundamental": result}}


async def run_sentiment(state: AgentState) -> dict:
    result = await asyncio.to_thread(sentiment.analyse, state["ticker"], state["news"])
    return {"analyst_outputs": {"sentiment": result}}


async def run_synthesis(state: AgentState) -> dict:
    outputs = state["analyst_outputs"]
    result = await asyncio.to_thread(
        synthesis_agent.synthesize,
        state["ticker"],
        outputs.get("technical", {}),
        outputs.get("fundamental", {}),
        outputs.get("sentiment", {}),
    )
    return {"synthesis": result}


async def run_risk(state: AgentState) -> dict:
    result = await asyncio.to_thread(
        risk_agent.assess,
        state["ticker"],
        state["current_price"],
        state["synthesis"]["verdict"],
        state["analyst_outputs"].get("technical", {}),
    )
    return {"risk": result}


async def run_portfolio(state: AgentState) -> dict:
    result = await asyncio.to_thread(
        portfolio_agent.decide,
        state["ticker"],
        state["synthesis"],
        state["risk"],
    )
    return {"portfolio_decision": result}


async def save_trace(state: AgentState) -> dict:
    outputs = state["analyst_outputs"]
    trace_id = await asyncio.to_thread(
        trace_store.save_trace,
        ticker=state["ticker"],
        user_id=state["user_id"],
        boundary_mode=state["boundary_mode"],
        technical=outputs.get("technical", {}),
        fundamental=outputs.get("fundamental", {}),
        sentiment=outputs.get("sentiment", {}),
        synthesis=state["synthesis"],
        risk=state["risk"],
        final_decision=state["portfolio_decision"],
    )
    return {"trace_id": trace_id}


# ── Graph assembly ──────────────────────────────────────────────────────────

def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("fetch_data", fetch_data)
    builder.add_node("technical_analyst", run_technical)
    builder.add_node("fundamental_analyst", run_fundamental)
    builder.add_node("sentiment_analyst", run_sentiment)
    builder.add_node("synthesis", run_synthesis)
    builder.add_node("risk", run_risk)
    builder.add_node("portfolio", run_portfolio)
    builder.add_node("save_trace", save_trace)

    # Fan-out: fetch_data → all three analysts in parallel
    builder.add_edge(START, "fetch_data")
    builder.add_edge("fetch_data", "technical_analyst")
    builder.add_edge("fetch_data", "fundamental_analyst")
    builder.add_edge("fetch_data", "sentiment_analyst")

    # Fan-in: all three analysts → synthesis (LangGraph waits for all three)
    builder.add_edge("technical_analyst", "synthesis")
    builder.add_edge("fundamental_analyst", "synthesis")
    builder.add_edge("sentiment_analyst", "synthesis")

    # Sequential tail
    builder.add_edge("synthesis", "risk")
    builder.add_edge("risk", "portfolio")
    builder.add_edge("portfolio", "save_trace")
    builder.add_edge("save_trace", END)

    return builder.compile()


# Singleton compiled graph — compile once, reuse
_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
```

---

### Task 8: Update `agents/orchestrator.py`

**Files:**
- Modify: `agents/orchestrator.py`

- [ ] **Step 1: Replace orchestrator body with graph call**

```python
# agents/orchestrator.py
"""
Atlas Orchestrator — thin wrapper over the LangGraph pipeline.

The graph (agents/graph.py) handles all agent coordination.
This module exists so backend/services/pipeline_service.py
has a stable import surface.
"""
import asyncio
import time

from pydantic import BaseModel

from agents.graph import get_graph


class AgentSignal(BaseModel):
    ticker: str
    action: str          # BUY / SELL / HOLD
    confidence: float
    reasoning: str
    trace_id: str
    boundary_mode: str
    risk: dict
    latency_ms: int


async def run_pipeline_async(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
) -> AgentSignal:
    start = time.time()
    graph = get_graph()

    initial_state = {
        "ticker": ticker,
        "user_id": user_id,
        "boundary_mode": boundary_mode,
        "analyst_outputs": {},
        "synthesis": None,
        "risk": None,
        "portfolio_decision": None,
        "trace_id": None,
    }

    final_state = await graph.ainvoke(initial_state)

    decision = final_state["portfolio_decision"]
    risk = final_state["risk"]

    return AgentSignal(
        ticker=ticker,
        action=decision["action"],
        confidence=decision["confidence"],
        reasoning=decision["reasoning"],
        trace_id=final_state.get("trace_id", ""),
        boundary_mode=boundary_mode,
        risk={
            "stop_loss": risk["stop_loss"],
            "take_profit": risk["take_profit"],
            "position_size": risk["position_size"],
            "risk_reward_ratio": risk["risk_reward_ratio"],
        },
        latency_ms=round((time.time() - start) * 1000),
    )


def run_pipeline(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
) -> AgentSignal:
    """Sync wrapper — use in non-async contexts (e.g., FastAPI sync routes)."""
    return asyncio.run(run_pipeline_async(ticker, boundary_mode, user_id))
```

- [ ] **Step 2: Smoke-test from agents directory**

```bash
cd /Users/whatelz/Documents/GitHub/main/agents
uv run python -c "
from agents.orchestrator import run_pipeline
sig = run_pipeline('AAPL')
print(sig.action, sig.confidence, sig.latency_ms)
"
```

Expected: prints `BUY/SELL/HOLD <float> <int>ms` in roughly same time as before (or faster due to parallel analysts).

- [ ] **Step 3: Commit**

```bash
git add agents/state.py agents/graph.py agents/orchestrator.py
git commit -m "feat: migrate agent pipeline to LangGraph with parallel analyst fan-out"
```

---

## Chunk 3: Alpaca Broker Adapter

### Task 9: Create `BrokerAdapter` protocol

**Files:**
- Create: `backend/broker/__init__.py`
- Create: `backend/broker/base.py`

- [ ] **Step 1: Create package init (empty)**

- [ ] **Step 2: Create protocol**

```python
# backend/broker/base.py
"""
BrokerAdapter — the Protocol all broker implementations must satisfy.

Never call broker APIs directly. Always go through this interface.
New brokers (IBKR, Binance) are added by implementing this protocol.
"""
from typing import Protocol, runtime_checkable


@runtime_checkable
class BrokerAdapter(Protocol):
    def place_order(self, ticker: str, action: str, notional: float) -> dict:
        """
        Place a market order.

        Args:
            ticker:   e.g. "AAPL"
            action:   "BUY" or "SELL"
            notional: dollar amount to trade (e.g. 1000.0)

        Returns:
            dict with at minimum: {"order_id": str, "status": str}
        """
        ...

    def get_account(self) -> dict:
        """Returns account equity, cash, buying_power."""
        ...

    def get_positions(self) -> list[dict]:
        """Returns list of open positions."""
        ...

    def cancel_order(self, order_id: str) -> bool:
        """Cancels an open order. Returns True if successful."""
        ...
```

---

### Task 10: Implement `AlpacaAdapter`

**Files:**
- Create: `backend/broker/alpaca.py`

- [ ] **Step 1: Implement adapter**

```python
# backend/broker/alpaca.py
"""
AlpacaAdapter — paper trading implementation of BrokerAdapter.

Uses alpaca-py (alpaca.markets/sdks/python).
Reads ALPACA_API_KEY, ALPACA_SECRET_KEY from environment.
ALPACA_BASE_URL defaults to paper trading endpoint.
"""
import os

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce


class AlpacaAdapter:
    def __init__(self) -> None:
        api_key = os.environ["ALPACA_API_KEY"]
        secret_key = os.environ["ALPACA_SECRET_KEY"]
        base_url = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
        self._client = TradingClient(
            api_key=api_key,
            secret_key=secret_key,
            paper=True,
            url_override=base_url,
        )

    def place_order(self, ticker: str, action: str, notional: float) -> dict:
        side = OrderSide.BUY if action.upper() == "BUY" else OrderSide.SELL
        req = MarketOrderRequest(
            symbol=ticker,
            notional=round(notional, 2),
            side=side,
            time_in_force=TimeInForce.DAY,
        )
        order = self._client.submit_order(req)
        return {
            "order_id": str(order.id),
            "status": str(order.status),
            "ticker": ticker,
            "action": action,
            "notional": notional,
        }

    def get_account(self) -> dict:
        acct = self._client.get_account()
        return {
            "equity": float(acct.equity),
            "cash": float(acct.cash),
            "buying_power": float(acct.buying_power),
            "portfolio_value": float(acct.portfolio_value),
        }

    def get_positions(self) -> list[dict]:
        positions = self._client.get_all_positions()
        return [
            {
                "ticker": p.symbol,
                "qty": float(p.qty),
                "avg_cost": float(p.avg_entry_price),
                "current_price": float(p.current_price),
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
            }
            for p in positions
        ]

    def cancel_order(self, order_id: str) -> bool:
        try:
            self._client.cancel_order_by_id(order_id)
            return True
        except Exception:
            return False
```

---

### Task 11: Create broker factory

**Files:**
- Create: `backend/broker/factory.py`

- [ ] **Step 1: Write factory**

```python
# backend/broker/factory.py
"""
get_broker() returns the appropriate BrokerAdapter based on environment.

BROKER env var selects the implementation:
  "alpaca"  (default) — Alpaca paper trading
  "ibkr"              — Interactive Brokers (Phase 4, not yet implemented)
"""
import os

from broker.base import BrokerAdapter


def get_broker() -> BrokerAdapter:
    broker = os.getenv("BROKER", "alpaca").lower()
    if broker == "alpaca":
        from broker.alpaca import AlpacaAdapter
        return AlpacaAdapter()
    raise ValueError(f"Unknown broker: {broker!r}. Set BROKER env var to 'alpaca'.")
```

- [ ] **Step 2: Add Alpaca keys to backend `.env`**

The `.env` should already have these from the previous session:
```
ALPACA_API_KEY=<your-paper-key>
ALPACA_SECRET_KEY=<your-paper-secret>
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

- [ ] **Step 3: Smoke-test the broker**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend
uv run python -c "
from broker.factory import get_broker
b = get_broker()
print(b.get_account())
print(b.get_positions())
"
```

Expected: prints account dict with equity/cash/buying_power. Positions may be empty list if no paper trades placed yet.

- [ ] **Step 4: Commit**

```bash
git add backend/broker/
git commit -m "feat: add BrokerAdapter protocol + AlpacaAdapter paper trading implementation"
```

---

## Chunk 4: Execution Boundary Controller + Pipeline Route

The EBC is the product's core differentiator. It sits between the pipeline output and broker execution.

### Task 12: Create `boundary/modes.py`

**Files:**
- Create: `backend/boundary/__init__.py`
- Create: `backend/boundary/modes.py`

- [ ] **Step 1: Create package init (empty)**

- [ ] **Step 2: Define modes and config**

```python
# backend/boundary/modes.py
"""
Execution Boundary modes + per-mode configuration.

Advisory:    Signal generated. No execution. Human decides.
Conditional: Signal generated. Execution only after human approval.
Autonomous:  Signal executed immediately. Override window open after.
"""
from enum import Enum


class BoundaryMode(str, Enum):
    ADVISORY = "advisory"
    CONDITIONAL = "conditional"
    AUTONOMOUS = "autonomous"


# Per-mode configuration
MODE_CONFIG = {
    BoundaryMode.ADVISORY: {
        "min_confidence": 0.0,   # always surface signals
        "notional_usd": 0.0,     # no execution
        "override_window_s": 0,
    },
    BoundaryMode.CONDITIONAL: {
        "min_confidence": 0.60,  # only surface high-confidence signals for approval
        "notional_usd": 1000.0,  # dollar amount if approved
        "override_window_s": 0,  # no override — user already approved
    },
    BoundaryMode.AUTONOMOUS: {
        "min_confidence": 0.65,  # only auto-execute high-confidence signals
        "notional_usd": 1000.0,
        "override_window_s": 300,  # 5-minute override window after execution
    },
}
```

---

### Task 13: Create `boundary/controller.py`

**Files:**
- Create: `backend/boundary/controller.py`

- [ ] **Step 1: Implement EBC**

```python
# backend/boundary/controller.py
"""
Execution Boundary Controller (EBC) — Atlas's core differentiator.

Takes an AgentSignal and a configured mode, routes to the correct
execution path, and returns an ExecutionResult.

Advisory:    No execution. Returns signal for display.
Conditional: Returns pending_approval status. Execution happens
             only when user hits /v1/signals/{id}/approve.
Autonomous:  Places order immediately via broker. Logs everything.
             Override window open for configured seconds.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from boundary.modes import BoundaryMode, MODE_CONFIG

if TYPE_CHECKING:
    from broker.base import BrokerAdapter


@dataclass
class ExecutionResult:
    mode: str
    executed: bool
    status: str                  # "advisory" | "awaiting_approval" | "filled" | "skipped"
    signal_id: str
    ticker: str
    action: str
    confidence: float
    reasoning: str
    risk: dict
    order_id: str | None = None
    override_window_s: int = 0
    message: str = ""
    extra: dict = field(default_factory=dict)


class EBC:
    """
    Execution Boundary Controller.

    Usage:
        ebc = EBC(broker=get_broker())
        result = ebc.execute(signal, mode="autonomous")
    """

    def __init__(self, broker: BrokerAdapter | None = None) -> None:
        self._broker = broker

    def execute(self, signal, mode: str) -> ExecutionResult:
        """
        Route signal to the correct execution path.

        Args:
            signal: AgentSignal from orchestrator
            mode:   "advisory" | "conditional" | "autonomous"
        """
        bmode = BoundaryMode(mode)
        config = MODE_CONFIG[bmode]

        base = {
            "mode": mode,
            "signal_id": signal.trace_id,
            "ticker": signal.ticker,
            "action": signal.action,
            "confidence": signal.confidence,
            "reasoning": signal.reasoning,
            "risk": signal.risk,
        }

        if bmode == BoundaryMode.ADVISORY:
            return ExecutionResult(
                **base,
                executed=False,
                status="advisory",
                message="Signal generated. No execution in advisory mode.",
            )

        if signal.confidence < config["min_confidence"]:
            return ExecutionResult(
                **base,
                executed=False,
                status="skipped",
                message=f"Confidence {signal.confidence:.0%} below threshold "
                        f"{config['min_confidence']:.0%} for {mode} mode.",
            )

        if bmode == BoundaryMode.CONDITIONAL:
            return ExecutionResult(
                **base,
                executed=False,
                status="awaiting_approval",
                message="Signal pending user approval. Use /v1/signals/{id}/approve to execute.",
            )

        # Autonomous — execute immediately
        if self._broker is None:
            return ExecutionResult(
                **base,
                executed=False,
                status="skipped",
                message="Autonomous mode requested but no broker configured.",
            )

        # Only execute BUY/SELL — skip HOLD
        if signal.action == "HOLD":
            return ExecutionResult(
                **base,
                executed=False,
                status="skipped",
                message="HOLD signal — no order placed.",
            )

        notional = config["notional_usd"]
        order = self._broker.place_order(signal.ticker, signal.action, notional)

        return ExecutionResult(
            **base,
            executed=True,
            status="filled",
            order_id=order["order_id"],
            override_window_s=config["override_window_s"],
            message=f"Order placed: {signal.action} ${notional} of {signal.ticker}.",
            extra={"order": order},
        )
```

---

### Task 14: Create `pipeline` route + `pipeline_service`

**Files:**
- Create: `backend/services/pipeline_service.py`
- Create: `backend/api/routes/pipeline.py`

- [ ] **Step 1: Create pipeline service**

```python
# backend/services/pipeline_service.py
"""
Pipeline service — orchestrates the agent pipeline + EBC.

Called by the pipeline route. Keeps the route thin.
"""
import logging
from dataclasses import asdict
from datetime import datetime, timezone

from boundary.controller import EBC
from boundary.modes import BoundaryMode

logger = logging.getLogger(__name__)


def run_pipeline_with_ebc(ticker: str, boundary_mode: str, user_id: str = "system") -> dict:
    """
    Run the full agent pipeline for a ticker and apply the EBC.

    Returns a dict ready to be returned as JSON from the API.
    """
    # Validate mode early — fail fast with a clear message
    try:
        BoundaryMode(boundary_mode)
    except ValueError:
        valid = [m.value for m in BoundaryMode]
        raise ValueError(f"Invalid boundary_mode '{boundary_mode}'. Must be one of: {valid}")

    # Import here to avoid circular imports at module load time
    from agents.orchestrator import run_pipeline

    signal = run_pipeline(ticker=ticker.upper(), boundary_mode=boundary_mode, user_id=user_id)
    logger.info("Pipeline complete: %s %s %.0f%% confidence", signal.action, ticker, signal.confidence * 100)

    # Set up broker only for autonomous mode (avoids failing if keys not set for advisory)
    broker = None
    if boundary_mode == BoundaryMode.AUTONOMOUS.value:
        try:
            from broker.factory import get_broker
            broker = get_broker()
        except Exception as exc:
            logger.warning("Could not initialize broker for autonomous mode: %s", exc)

    ebc = EBC(broker=broker)
    result = ebc.execute(signal, mode=boundary_mode)

    return {
        "signal": {
            "id": signal.trace_id,
            "ticker": signal.ticker,
            "action": signal.action,
            "confidence": signal.confidence,
            "reasoning": signal.reasoning,
            "boundary_mode": boundary_mode,
            "risk": signal.risk,
            "trace_id": signal.trace_id,
            "latency_ms": signal.latency_ms,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        "execution": {
            "status": result.status,
            "executed": result.executed,
            "mode": result.mode,
            "message": result.message,
            "order_id": result.order_id,
            "override_window_s": result.override_window_s,
        },
    }
```

- [ ] **Step 2: Create pipeline route**

```python
# backend/api/routes/pipeline.py
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.pipeline_service import run_pipeline_with_ebc

router = APIRouter(prefix="/v1", tags=["pipeline"])
logger = logging.getLogger(__name__)


class PipelineRequest(BaseModel):
    ticker: str = "AAPL"
    boundary_mode: str = "advisory"
    user_id: str = "system"


@router.post("/pipeline/run")
def run_pipeline(req: PipelineRequest):
    """
    Run the full agent pipeline for a ticker and apply the EBC.

    - advisory:    Returns signal. No execution.
    - conditional: Returns signal with status=awaiting_approval.
    - autonomous:  Executes via Alpaca. Returns filled order details.
    """
    try:
        return run_pipeline_with_ebc(
            ticker=req.ticker,
            boundary_mode=req.boundary_mode,
            user_id=req.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Pipeline failed for %s", req.ticker)
        raise HTTPException(status_code=500, detail=str(exc))
```

- [ ] **Step 3: Start the server and test all three modes**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend
uv run uvicorn main:app --reload
```

In another terminal:

```bash
# Advisory mode — signal only, no execution
curl -s -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "boundary_mode": "advisory"}' | jq .

# Conditional mode — awaiting_approval
curl -s -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "boundary_mode": "conditional"}' | jq .

# Autonomous mode — real paper order placed (if confidence >= 0.65 and action != HOLD)
curl -s -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "boundary_mode": "autonomous"}' | jq .
```

Expected advisory response:
```json
{
  "signal": { "action": "BUY", "confidence": 0.75, ... },
  "execution": { "status": "advisory", "executed": false, ... }
}
```

Expected autonomous response (if BUY/SELL with sufficient confidence):
```json
{
  "signal": { ... },
  "execution": { "status": "filled", "executed": true, "order_id": "alpaca-uuid", ... }
}
```

- [ ] **Step 4: Verify in Alpaca dashboard**

If autonomous mode returned `"executed": true`, open the Alpaca paper trading dashboard → Portfolio → Orders. The order should appear there.

- [ ] **Step 5: Commit**

```bash
git add backend/boundary/ backend/services/ backend/api/routes/pipeline.py
git commit -m "feat: implement Execution Boundary Controller + Alpaca paper trading integration"
```

---

## Final Commit

- [ ] **Push to main**

```bash
git push origin main
```

---

## What this delivers

| Feature | Done |
|---------|------|
| Backend split into api/routes/broker/boundary/services | ✅ |
| LangGraph parallel analyst fan-out | ✅ |
| Alpaca paper trading broker adapter | ✅ |
| EBC with all three modes functionally distinct | ✅ |
| Real paper orders placed in Autonomous mode | ✅ |
| Awaiting-approval flow in Conditional mode | ✅ |
| FastAPI docs at `/docs` show all routes | ✅ |

## What's NOT done yet (next phases)

- Conditional mode approval actually triggers broker execution (requires persistent pending signal store — Supabase trades table, Phase 4)
- Autonomous override window actually cancels the order (requires background task, Phase 4)
- Live portfolio/signals from Alpaca (currently stub data — Phase 4)
- LLM multi-provider (Anthropic, OpenAI factory entries — Phase 5)
- Layered memory (FinMem short/medium/long-term — Phase 3)
