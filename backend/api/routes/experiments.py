# backend/api/routes/experiments.py
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator

from api.dependencies import require_admin
from backtesting.runner import run_backtest_job
from services.backtest_service import create_job, list_jobs
from services.experiment_service import (
    create_experiment,
    delete_experiment,
    get_experiment,
    list_experiments,
)

router = APIRouter(prefix="/v1/experiments", tags=["experiments"])

_PHILOSOPHIES = ["lynch", "soros", "buffett", "balanced"]
_THRESHOLDS   = [0.50, 0.65, 0.80, 0.95]


class ExperimentRequest(BaseModel):
    experiment_type: Literal["philosophy", "threshold", "single"]
    name: str
    tickers: list[str]
    start_date: date
    end_date: date
    ebc_mode: str
    # Base settings (fixed dimension for multi-variant experiments)
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

    @model_validator(mode="after")
    def validate_dates(self) -> "ExperimentRequest":
        today = date.today()
        if self.end_date >= today - timedelta(days=1):
            raise ValueError("end_date must be at least 2 days in the past")
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if (self.end_date - self.start_date).days > 90:
            raise ValueError("Date range cannot exceed 90 days")
        return self


def _build_variants(req: ExperimentRequest) -> list[dict]:
    """Return the list of (philosophy_mode, confidence_threshold) pairs for this experiment."""
    if req.experiment_type == "philosophy":
        return [
            {"philosophy_mode": p, "confidence_threshold": req.confidence_threshold}
            for p in _PHILOSOPHIES
        ]
    if req.experiment_type == "threshold":
        return [
            {"philosophy_mode": req.philosophy_mode, "confidence_threshold": t}
            for t in _THRESHOLDS
        ]
    # single
    return [{"philosophy_mode": req.philosophy_mode, "confidence_threshold": req.confidence_threshold}]


@router.post("")
async def create_experiment_endpoint(
    req: ExperimentRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_admin),
):
    variants = _build_variants(req)

    exp_id = create_experiment(
        user_id=user_id,
        name=req.name,
        experiment_type=req.experiment_type,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
    )

    job_ids: list[str] = []
    for v in variants:
        job_id = create_job(
            user_id=user_id,
            tickers=req.tickers,
            start_date=req.start_date.isoformat(),
            end_date=req.end_date.isoformat(),
            ebc_mode=req.ebc_mode,
            philosophy_mode=v["philosophy_mode"],
            confidence_threshold=v["confidence_threshold"],
            experiment_id=exp_id,
        )
        background_tasks.add_task(
            run_backtest_job,
            job_id=job_id,
            user_id=user_id,
            tickers=req.tickers,
            start_date=req.start_date.isoformat(),
            end_date=req.end_date.isoformat(),
            ebc_mode=req.ebc_mode,
            philosophy_mode=v["philosophy_mode"],
            confidence_threshold=v["confidence_threshold"],
        )
        job_ids.append(job_id)

    return {"experiment_id": exp_id, "job_ids": job_ids, "status": "launched"}


@router.get("")
def list_experiments_endpoint(user_id: str = Depends(require_admin)):
    experiments = list_experiments(user_id)
    all_jobs = list_jobs(user_id)

    jobs_by_exp: dict[str, list[dict]] = {}
    for job in all_jobs:
        exp_id = job.get("experiment_id")
        if exp_id:
            jobs_by_exp.setdefault(exp_id, []).append(job)

    for exp in experiments:
        exp["jobs"] = jobs_by_exp.get(exp["id"], [])

    return experiments


@router.get("/{exp_id}")
def get_experiment_endpoint(exp_id: str, user_id: str = Depends(require_admin)):
    exp = get_experiment(exp_id, user_id)
    if exp is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    all_jobs = list_jobs(user_id)
    exp["jobs"] = [j for j in all_jobs if j.get("experiment_id") == exp_id]
    return exp


@router.delete("/{exp_id}")
def delete_experiment_endpoint(exp_id: str, user_id: str = Depends(require_admin)):
    result = delete_experiment(exp_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {"deleted": True}
