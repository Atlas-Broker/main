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
