# backend/api/routes/experiments.py
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator

import inngest as inngest_sdk
from inngest_client import inngest_client
from api.dependencies import require_admin
from db.supabase import get_supabase
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


class VariantSpec(BaseModel):
    philosophy_mode: str = "balanced"
    confidence_threshold: Optional[float] = None


class ExperimentRequest(BaseModel):
    experiment_type: Literal["philosophy", "threshold", "single", "custom"]
    name: str
    tickers: list[str]
    start_date: date
    end_date: date
    ebc_mode: str
    # Base settings (fixed dimension for multi-variant experiments)
    philosophy_mode: str = "balanced"
    confidence_threshold: Optional[float] = None
    initial_capital: float = 100_000.0
    # For custom experiments: explicit list of variants
    custom_variants: Optional[list[VariantSpec]] = None

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
    if req.experiment_type == "custom" and req.custom_variants:
        return [{"philosophy_mode": v.philosophy_mode, "confidence_threshold": v.confidence_threshold} for v in req.custom_variants]
    # single
    return [{"philosophy_mode": req.philosophy_mode, "confidence_threshold": req.confidence_threshold}]


@router.post("")
def create_experiment_endpoint(
    req: ExperimentRequest,
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
            initial_capital=req.initial_capital,
        )
        job_ids.append(job_id)
        inngest_client.send_sync(inngest_sdk.Event(
            name="atlas/backtest.run",
            data={
                "job_id": job_id,
                "user_id": user_id,
                "tickers": req.tickers,
                "start_date": req.start_date.isoformat(),
                "end_date": req.end_date.isoformat(),
                "ebc_mode": req.ebc_mode,
                "philosophy_mode": v["philosophy_mode"],
                "confidence_threshold": v["confidence_threshold"],
                "initial_capital": req.initial_capital,
            },
        ))

    return {"experiment_id": exp_id, "job_ids": job_ids, "status": "launched"}


class AdoptRequest(BaseModel):
    job_ids: list[str]
    name: str = "Unknown"
    experiment_type: str = "multi"


@router.post("/adopt")
def adopt_orphan_jobs(req: AdoptRequest, user_id: str = Depends(require_admin)):
    """Create an experiment record for existing orphan jobs and link them to it."""
    # Fetch the jobs to get tickers/dates/ebc_mode from the first one
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("*")
        .in_("id", req.job_ids)
        .eq("user_id", user_id)
        .execute()
    )
    jobs = result.data or []
    if not jobs:
        raise HTTPException(status_code=404, detail="No matching jobs found")

    first = jobs[0]
    exp_id = create_experiment(
        user_id=user_id,
        name=req.name,
        experiment_type=req.experiment_type,
        tickers=first["tickers"],
        start_date=first["start_date"],
        end_date=first["end_date"],
        ebc_mode=first["ebc_mode"],
    )
    # Link all jobs to the new experiment
    get_supabase().table("backtest_jobs").update({"experiment_id": exp_id}).in_("id", req.job_ids).eq("user_id", user_id).execute()
    return {"experiment_id": exp_id}


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
