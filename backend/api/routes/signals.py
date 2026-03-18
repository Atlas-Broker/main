# backend/api/routes/signals.py
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.dependencies import get_current_user

router = APIRouter(prefix="/v1", tags=["signals"])
logger = logging.getLogger(__name__)


class RiskParams(BaseModel):
    stop_loss: float
    take_profit: float
    position_size: int
    risk_reward_ratio: float


class Signal(BaseModel):
    id: str
    ticker: str
    action: str
    confidence: float
    reasoning: str
    boundary_mode: str
    status: str = "signal"
    risk: RiskParams
    created_at: str
    trace: dict[str, Any] | None = None
    execution: dict[str, Any] | None = None


@router.get("/signals", response_model=list[Signal])
def get_signals(limit: int = 20, user_id: str = Depends(get_current_user)):
    try:
        from services.signals_service import get_recent_signals
        return get_recent_signals(user_id=user_id, limit=limit)
    except Exception as exc:
        logger.exception("Failed to fetch signals from MongoDB")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/signals/{signal_id}/approve")
def approve_signal(signal_id: str, user_id: str = Depends(get_current_user)):
    try:
        from services.signals_service import approve_and_execute, AlreadyExecutedError
        return approve_and_execute(signal_id=signal_id, user_id=user_id)
    except AlreadyExecutedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to approve signal %s", signal_id)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/signals/{signal_id}/reject")
def reject_signal_route(
    signal_id: str,
    user_id: str = Depends(get_current_user),
):
    """Reject a signal and persist the decision."""
    try:
        from services.signals_service import reject_signal
        return reject_signal(signal_id, user_id)
    except HTTPException:
        raise  # re-raise 400/404/409 from service layer as-is
    except Exception as exc:
        logger.exception("Failed to reject signal %s for user %s", signal_id, user_id)
        raise HTTPException(status_code=500, detail=str(exc))
