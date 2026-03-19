# backend/api/routes/backtest.py
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator

from api.dependencies import get_current_user
from backtesting.runner import run_backtest_job
from services.backtest_service import create_job, delete_job, get_job, list_jobs

router = APIRouter(prefix="/v1/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    tickers: list[str]
    start_date: date
    end_date: date
    ebc_mode: str

    @field_validator("tickers")
    @classmethod
    def validate_tickers(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 10:
            raise ValueError("tickers must be 1–10 items")
        return [t.strip().upper() for t in v]

    @field_validator("ebc_mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("advisory", "conditional", "autonomous"):
            raise ValueError("ebc_mode must be advisory, conditional, or autonomous")
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
    user_id: str = Depends(get_current_user),
):
    jobs = list_jobs(user_id)
    if any(j["status"] == "running" for j in jobs):
        raise HTTPException(
            status_code=429,
            detail="You already have a backtest running. Please wait for it to complete.",
        )
    job_id = create_job(
        user_id=user_id,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
    )
    background_tasks.add_task(
        run_backtest_job,
        job_id=job_id,
        user_id=user_id,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
    )
    return {"job_id": job_id, "status": "queued"}


@router.get("")
def list_backtest_jobs(user_id: str = Depends(get_current_user)):
    return list_jobs(user_id)


@router.get("/{job_id}")
def get_backtest_job(job_id: str, user_id: str = Depends(get_current_user)):
    job = get_job(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}")
def delete_backtest_job(job_id: str, user_id: str = Depends(get_current_user)):
    result = delete_job(job_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if result is False:
        raise HTTPException(status_code=409, detail="Cannot delete a running job.")
    return {"deleted": True}
