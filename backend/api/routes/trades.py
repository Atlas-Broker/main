from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.dependencies import get_current_user

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
def get_trades(user_id: str = Depends(get_current_user)):
    return [
        Trade(id="trd-001", ticker="TSLA", action="BUY", shares=10, price=248.50,
              status="filled", executed_at="2026-03-10T10:22:00Z"),
        Trade(id="trd-002", ticker="META", action="SELL", shares=15, price=612.80,
              status="filled", executed_at="2026-03-08T15:45:00Z"),
    ]


@router.post("/trades/{trade_id}/override")
def override_trade(trade_id: str, user_id: str = Depends(get_current_user)):
    return {"trade_id": trade_id, "status": "override_requested"}
