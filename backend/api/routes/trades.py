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
