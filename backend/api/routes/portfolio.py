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

        positions = [
            Position(
                ticker=p["ticker"],
                shares=p["qty"],
                avg_cost=p["avg_cost"],
                current_price=p["current_price"],
                pnl=p["unrealized_pl"],
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
