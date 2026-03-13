import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# --- Keep-alive (Render free tier) ---
# Render sets RENDER_EXTERNAL_URL automatically on every deploy.
# The background task pings /health every 10 minutes to prevent the dyno sleeping.
# Only runs when RENDER_EXTERNAL_URL is present (i.e. on Render, not locally).

KEEP_ALIVE_INTERVAL = 10 * 60  # seconds


async def _keep_alive_loop(base_url: str) -> None:
    async with httpx.AsyncClient() as client:
        while True:
            await asyncio.sleep(KEEP_ALIVE_INTERVAL)
            try:
                await client.get(f"{base_url}/health", timeout=10)
                logger.debug("Keep-alive ping sent to %s", base_url)
            except Exception as exc:
                logger.warning("Keep-alive ping failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    task = None
    if render_url:
        logger.info("Starting keep-alive loop → %s", render_url)
        task = asyncio.create_task(_keep_alive_loop(render_url))
    yield
    if task:
        task.cancel()


# --- App ---

app = FastAPI(title="Atlas API", version="0.1.0", docs_url="/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Models ---

class Signal(BaseModel):
    id: str
    ticker: str
    action: str  # BUY / SELL / HOLD
    confidence: float
    reasoning: str
    boundary_mode: str  # advisory / conditional / autonomous
    created_at: str


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


class Trade(BaseModel):
    id: str
    ticker: str
    action: str
    shares: float
    price: float
    status: str
    executed_at: str


# --- Routes ---

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0", "environment": os.getenv("ENVIRONMENT", "development")}


@app.get("/v1/signals", response_model=list[Signal])
def get_signals():
    return [
        Signal(id="sig-001", ticker="AAPL", action="BUY", confidence=0.78,
               reasoning="Strong momentum with RSI divergence on weekly timeframe. Earnings beat last quarter. Volume confirms breakout.",
               boundary_mode="advisory", created_at="2026-03-13T09:00:00Z"),
        Signal(id="sig-002", ticker="MSFT", action="HOLD", confidence=0.62,
               reasoning="Consolidating at key support zone. Await volume confirmation before adding to position.",
               boundary_mode="conditional", created_at="2026-03-12T14:30:00Z"),
        Signal(id="sig-003", ticker="NVDA", action="SELL", confidence=0.71,
               reasoning="Extended valuation relative to sector. Bearish divergence on daily RSI. Risk/reward unfavourable.",
               boundary_mode="advisory", created_at="2026-03-11T11:00:00Z"),
    ]


@app.get("/v1/portfolio", response_model=PortfolioSummary)
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


@app.get("/v1/trades", response_model=list[Trade])
def get_trades():
    return [
        Trade(id="trd-001", ticker="TSLA", action="BUY", shares=10, price=248.50, status="filled", executed_at="2026-03-10T10:22:00Z"),
        Trade(id="trd-002", ticker="META", action="SELL", shares=15, price=612.80, status="filled", executed_at="2026-03-08T15:45:00Z"),
        Trade(id="trd-003", ticker="AAPL", action="BUY", shares=50, price=172.40, status="filled", executed_at="2026-03-05T09:35:00Z"),
    ]


@app.post("/v1/signals/{signal_id}/approve")
def approve_signal(signal_id: str):
    """Conditional mode: user approves a proposed trade."""
    return {"signal_id": signal_id, "status": "approved", "message": "Signal approved for execution."}


@app.post("/v1/signals/{signal_id}/reject")
def reject_signal(signal_id: str):
    """Conditional mode: user rejects a proposed trade."""
    return {"signal_id": signal_id, "status": "rejected", "message": "Signal rejected by user."}


@app.post("/v1/trades/{trade_id}/override")
def override_trade(trade_id: str):
    """Autonomous mode: user overrides an already-executed trade."""
    return {"trade_id": trade_id, "status": "override_requested", "message": "Override submitted. Trade will be reversed."}
