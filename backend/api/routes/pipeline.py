import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.pipeline_service import run_pipeline_with_ebc

router = APIRouter(prefix="/v1", tags=["pipeline"])
logger = logging.getLogger(__name__)


class PipelineRequest(BaseModel):
    ticker: str = "AAPL"
    boundary_mode: str = "advisory"
    user_id: str = "system"


@router.post("/pipeline/run")
def run_pipeline(req: PipelineRequest):
    """
    Run the full agent pipeline for a ticker and apply the EBC.

    - advisory:    Returns signal. No execution.
    - conditional: Returns signal with status=awaiting_approval.
    - autonomous:  Executes via Alpaca paper trading. Returns filled order details.
    """
    try:
        return run_pipeline_with_ebc(
            ticker=req.ticker,
            boundary_mode=req.boundary_mode,
            user_id=req.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Pipeline failed for %s", req.ticker)
        raise HTTPException(status_code=500, detail=str(exc))
