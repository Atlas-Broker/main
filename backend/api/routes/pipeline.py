import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from api.dependencies import get_current_user
from services.pipeline_service import run_pipeline_with_ebc

router = APIRouter(prefix="/v1", tags=["pipeline"])
logger = logging.getLogger(__name__)

_VALID_PHILOSOPHY_MODES = frozenset({"balanced", "value", "momentum", "macro"})


class PipelineRequest(BaseModel):
    ticker: str = "AAPL"
    boundary_mode: str = "advisory"
    philosophy_mode: str | None = None

    @field_validator("philosophy_mode")
    @classmethod
    def validate_philosophy_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_PHILOSOPHY_MODES:
            raise ValueError(
                f"Invalid philosophy_mode '{v}'. "
                f"Must be one of: {sorted(_VALID_PHILOSOPHY_MODES)} or null."
            )
        return v


@router.post("/pipeline/run")
def run_pipeline(req: PipelineRequest, user_id: str = Depends(get_current_user)):
    """
    Run the full agent pipeline for a ticker and apply the EBC.

    - advisory:    Returns signal. No execution.
    - conditional: Returns signal with status=awaiting_approval.
    - autonomous:  Executes via Alpaca paper trading. Returns filled order details.

    Optional philosophy_mode overlays an investment lens on all analyst prompts:
    - balanced (default): No overlay. Current behaviour.
    - value:     Buffett-style — intrinsic value, margin of safety, moat.
    - momentum:  Trend-following — price action, relative strength, breakouts.
    - macro:     Top-down — interest rates, sector rotation, macro environment.
    """
    try:
        return run_pipeline_with_ebc(
            ticker=req.ticker,
            boundary_mode=req.boundary_mode,
            user_id=user_id,
            philosophy_mode=req.philosophy_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Pipeline failed for %s", req.ticker)
        raise HTTPException(status_code=500, detail=str(exc))
