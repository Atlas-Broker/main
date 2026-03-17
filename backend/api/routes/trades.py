import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_current_user
from services import trade_service

router = APIRouter(prefix="/v1", tags=["trades"])
logger = logging.getLogger(__name__)


class Trade(BaseModel):
    id: str
    ticker: str
    action: str
    shares: float
    price: float
    status: str
    executed_at: str


class OverrideRequest(BaseModel):
    reason: str | None = None


@router.get("/trades", response_model=list[Trade])
def get_trades(user_id: str = Depends(get_current_user)):
    return [
        Trade(id="trd-001", ticker="TSLA", action="BUY", shares=10, price=248.50,
              status="filled", executed_at="2026-03-10T10:22:00Z"),
        Trade(id="trd-002", ticker="META", action="SELL", shares=15, price=612.80,
              status="filled", executed_at="2026-03-08T15:45:00Z"),
    ]


@router.post("/trades/{trade_id}/override")
def override_trade(
    trade_id: str,
    body: OverrideRequest,
    user_id: str = Depends(get_current_user),
):
    """Cancel a trade within its 5-minute override window."""
    try:
        return trade_service.cancel_and_log(trade_id, user_id, body.reason)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to override trade %s", trade_id)
        raise HTTPException(status_code=500, detail=str(exc))
