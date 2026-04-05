# backend/api/routes/backtest.py
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator

from api.dependencies import require_admin
from db.supabase import get_user_role
from agents.philosophy import VALID_PHILOSOPHY_MODES
from backtesting.runner import run_backtest_job, request_cancellation
from services.backtest_service import create_job, delete_job, get_job, list_jobs, update_job_status

router = APIRouter(prefix="/v1/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    tickers: list[str]
    start_date: date
    end_date: date
    ebc_mode: str
    philosophy_mode: str = "balanced"
    confidence_threshold: Optional[float] = None

    @field_validator("tickers")
    @classmethod
    def validate_tickers(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 10:
            raise ValueError("tickers must be 1–10 items")
        return [t.strip().upper() for t in v]

    @field_validator("ebc_mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("advisory", "autonomous_guardrail", "autonomous"):
            raise ValueError("ebc_mode must be advisory, autonomous_guardrail, or autonomous")
        return v

    @field_validator("philosophy_mode")
    @classmethod
    def validate_philosophy_mode(cls, v: str) -> str:
        if v not in VALID_PHILOSOPHY_MODES:
            raise ValueError(f"philosophy_mode must be one of {sorted(VALID_PHILOSOPHY_MODES)}")
        return v

    @field_validator("confidence_threshold")
    @classmethod
    def validate_confidence_threshold(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and not 0.0 <= v <= 1.0:
            raise ValueError("confidence_threshold must be between 0.0 and 1.0")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "BacktestRequest":
        today = date.today()
        if self.end_date >= today - timedelta(days=1):
            raise ValueError("end_date must be at least 2 days in the past")
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if (self.end_date - self.start_date).days > 90:
            raise ValueError("Date range cannot exceed 90 days")
        return self


@router.post("")
async def create_backtest(
    req: BacktestRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_admin),
):
    jobs = list_jobs(user_id)
    user_role = get_user_role(user_id)
    max_concurrent = 10 if user_role == "superadmin" else 5 if user_role == "admin" else 1
    running_count = sum(1 for j in jobs if j["status"] == "running")
    if running_count >= max_concurrent:
        raise HTTPException(
            status_code=429,
            detail=f"Maximum {max_concurrent} concurrent backtests reached for your plan.",
        )
    job_id = create_job(
        user_id=user_id,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
        philosophy_mode=req.philosophy_mode,
        confidence_threshold=req.confidence_threshold,
    )
    background_tasks.add_task(
        run_backtest_job,
        job_id=job_id,
        user_id=user_id,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
        philosophy_mode=req.philosophy_mode,
        confidence_threshold=req.confidence_threshold,
    )
    return {"job_id": job_id, "status": "queued"}


@router.get("")
def list_backtest_jobs(user_id: str = Depends(require_admin)):
    try:
        return list_jobs(user_id)
    except Exception:
        # On connection-level failures (e.g. HTTP/2 drop), reset the Supabase
        # singleton and retry once with a fresh client.
        from db.supabase import reset_supabase
        reset_supabase()
        return list_jobs(user_id)


@router.get("/{job_id}")
def get_backtest_job(job_id: str, user_id: str = Depends(require_admin)):
    job = get_job(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}")
def delete_backtest_job(job_id: str, user_id: str = Depends(require_admin)):
    result = delete_job(job_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if result is False:
        raise HTTPException(status_code=409, detail="Cannot delete a running job.")
    return {"deleted": True}


@router.post("/{job_id}/cancel")
def cancel_backtest_job(job_id: str, user_id: str = Depends(require_admin)):
    """Cancel a queued or running backtest job."""
    job = get_job(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in ("running", "queued"):
        raise HTTPException(status_code=409, detail=f"Cannot cancel job with status '{job['status']}'")
    if job["status"] == "queued":
        # Queued jobs haven't started the runner yet — cancel immediately
        update_job_status(job_id, "cancelled")
    else:
        # Running jobs: check whether the job is stale (runner process likely dead)
        STALE_THRESHOLD_HOURS = 2
        created_at_str = job.get("created_at", "")
        is_stale = False
        if created_at_str:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            age = datetime.now(timezone.utc) - created_at
            is_stale = age.total_seconds() > STALE_THRESHOLD_HOURS * 3600
        if is_stale:
            # Zombie job — no runner is reading the flag, force-cancel directly
            update_job_status(job_id, "cancelled")
        else:
            # Fresh running job — signal the in-process runner to stop gracefully
            request_cancellation(job_id)
    return {"cancelling": True}


@router.post("/{job_id}/resume")
async def resume_backtest_job_endpoint(
    job_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_admin),
):
    """Resume a failed or cancelled backtest job from its last checkpoint."""
    from backtesting.runner import resume_backtest_job
    job = get_job(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in ("failed", "cancelled"):
        raise HTTPException(status_code=409, detail=f"Cannot resume job with status '{job['status']}'")
    mongo_id = job.get("mongo_id")
    if not mongo_id:
        raise HTTPException(status_code=409, detail="Job has no results document — cannot resume. Create a new job instead.")
    background_tasks.add_task(
        resume_backtest_job,
        job_id=job_id,
        user_id=user_id,
        tickers=job["tickers"],
        start_date=job["start_date"],
        end_date=job["end_date"],
        ebc_mode=job["ebc_mode"],
        mongo_id=mongo_id,
        philosophy_mode=job.get("philosophy_mode", "balanced"),
        confidence_threshold=job.get("confidence_threshold"),
    )
    return {"resuming": True, "job_id": job_id}
