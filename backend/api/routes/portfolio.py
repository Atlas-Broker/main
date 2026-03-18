import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_current_user

router = APIRouter(prefix="/v1", tags=["portfolio"])
logger = logging.getLogger(__name__)


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
