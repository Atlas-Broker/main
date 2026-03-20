import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_current_user

router = APIRouter(prefix="/v1", tags=["portfolio"])
logger = logging.getLogger(__name__)

_MAX_LOG_LIMIT = 50


class Position(BaseModel):
    ticker: str
    shares: float
    avg_cost: float
    current_price: float
    pnl: float
    trade_id: str | None = None
    executed_at: str | None = None
    boundary_mode: str | None = None


class PortfolioSummary(BaseModel):
    total_value: float
    cash: float
    pnl_today: float
    pnl_total: float
    positions: list[Position]


_BASE_CAPITAL = 100_000.0  # Alpaca paper starting capital


@router.get("/portfolio", response_model=PortfolioSummary)
def get_portfolio(user_id: str = Depends(get_current_user)):
    try:
        from broker.factory import get_broker
        broker = get_broker()
        account = broker.get_account()
        raw_positions = broker.get_positions()

        # Fetch trade metadata from Supabase for override button support.
        # Graceful degradation: if Supabase is unavailable, positions still return.
        trade_by_ticker: dict = {}
        try:
            from db.supabase import get_supabase
            sb = get_supabase()
            trades_result = (
                sb.table("trades")
                .select("id, ticker, executed_at, boundary_mode")
                .eq("user_id", user_id)
                .neq("status", "overridden")
                .order("executed_at", desc=True)
                .execute()
            )
            for t in (trades_result.data or []):
                if t["ticker"] not in trade_by_ticker:
                    trade_by_ticker[t["ticker"]] = t
        except Exception as supabase_exc:
            logger.warning(
                "Supabase trade lookup failed — positions returned without override metadata: %r",
                supabase_exc,
            )

        positions = [
            Position(
                ticker=p["ticker"],
                shares=p["qty"],
                avg_cost=p["avg_cost"],
                current_price=p["current_price"],
                pnl=p["unrealized_pl"],
                trade_id=trade_by_ticker.get(p["ticker"], {}).get("id"),
                executed_at=trade_by_ticker.get(p["ticker"], {}).get("executed_at"),
                boundary_mode=trade_by_ticker.get(p["ticker"], {}).get("boundary_mode"),
            )
            for p in raw_positions
        ]

        total_unrealized_pl = sum(p.pnl for p in positions)
        pnl_total = account["equity"] - _BASE_CAPITAL

        return PortfolioSummary(
            total_value=account["portfolio_value"],
            cash=account["cash"],
            pnl_today=total_unrealized_pl,
            pnl_total=pnl_total,
            positions=positions,
        )
    except Exception as exc:
        logger.exception("Failed to fetch portfolio from Alpaca")
        raise HTTPException(status_code=500, detail=str(exc))


# ─── Equity curve ─────────────────────────────────────────────────────────────


class EquityPoint(BaseModel):
    date: str
    value: float


def _get_alpaca_credentials(user_id: str) -> dict[str, str] | None:
    """Return Alpaca credentials for user from Supabase, or None if not found."""
    try:
        from db.supabase import get_supabase
        sb = get_supabase()
        result = (
            sb.table("broker_connections")
            .select("api_key, api_secret, environment")
            .eq("user_id", user_id)
            .eq("broker", "alpaca")
            .maybe_single()
            .execute()
        )
        if not result.data:
            return None
        return result.data
    except Exception as exc:
        logger.warning("Supabase broker_connections lookup failed: %r", exc)
        return None


@router.get("/portfolio/equity-curve", response_model=list[EquityPoint])
async def get_equity_curve(user_id: str = Depends(get_current_user)) -> list[dict]:
    """Return the user's portfolio equity curve from Alpaca portfolio history."""
    credentials = _get_alpaca_credentials(user_id)
    if not credentials:
        return []

    api_key = credentials["api_key"]
    api_secret = credentials["api_secret"]
    base_url = (
        "https://paper-api.alpaca.markets"
        if credentials.get("environment") == "paper"
        else "https://api.alpaca.markets"
    )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{base_url}/v2/account/portfolio/history",
                params={"timeframe": "1D", "extended_hours": "false"},
                headers={
                    "APCA-API-KEY-ID": api_key,
                    "APCA-API-SECRET-KEY": api_secret,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        logger.warning("Alpaca portfolio history request failed: %r", exc)
        return []

    timestamps: list[int] = data.get("timestamp") or []
    equities: list[float | None] = data.get("equity") or []

    points = []
    for ts, value in zip(timestamps, equities):
        if value is None:
            continue
        date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        points.append({"date": date_str, "value": float(value)})

    return points


# ─── Ticker decision log ───────────────────────────────────────────────────────


class TickerDecision(BaseModel):
    action: str
    confidence: float
    reasoning: str
    created_at: str


_mongo_client = None  # module-level singleton — avoids creating a new client per request


def _get_mongo_collection():
    """Return the reasoning_traces MongoDB collection using a module-level singleton client."""
    global _mongo_client
    from pymongo import MongoClient
    if _mongo_client is None:
        uri = os.environ["MONGODB_URI"]
        _mongo_client = MongoClient(uri)
    db_name = os.environ.get("MONGODB_DB_NAME", "atlas")
    return _mongo_client[db_name]["reasoning_traces"]


@router.get(
    "/portfolio/positions/{ticker}/log",
    response_model=list[TickerDecision],
)
def get_ticker_decision_log(
    ticker: str,
    limit: int = Query(default=20, ge=1, le=_MAX_LOG_LIMIT),
    user_id: str = Depends(get_current_user),
) -> list[dict]:
    """Return AI decision log for a specific ticker from MongoDB reasoning_traces."""
    try:
        from pymongo import DESCENDING
        col = _get_mongo_collection()
        traces = list(
            col.find(
                {"user_id": user_id, "ticker": ticker},
                {"pipeline_run.final_decision.action": 1,
                 "pipeline_run.final_decision.confidence": 1,
                 "pipeline_run.final_decision.reasoning": 1,
                 "created_at": 1},
                sort=[("created_at", DESCENDING)],
            ).limit(limit)
        )
    except Exception as exc:
        logger.warning("MongoDB ticker log query failed for ticker=%r: %r", ticker, exc)
        return []

    results = []
    for trace in traces:
        decision = trace.get("pipeline_run", {}).get("final_decision", {})
        created = trace.get("created_at", "")
        created_str = created.isoformat() if hasattr(created, "isoformat") else str(created)
        results.append({
            "action": decision.get("action", "HOLD"),
            "confidence": float(decision.get("confidence", 0.0)),
            "reasoning": decision.get("reasoning", ""),
            "created_at": created_str,
        })

    return results
