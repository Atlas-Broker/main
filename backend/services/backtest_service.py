"""
Backtest job CRUD — Supabase metadata + MongoDB full results.

Supabase: backtest_jobs table (lightweight, queryable metadata)
MongoDB:  backtest_results collection (daily_runs, equity_curve, metrics)
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from pymongo import MongoClient

from db.supabase import get_supabase

_mongo_client: MongoClient | None = None


def _get_results_col():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(os.environ["MONGODB_URI"])
    return _mongo_client[os.environ.get("MONGODB_DB_NAME", "atlas")]["backtest_results"]


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(
    user_id: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
    philosophy_mode: str = "balanced",
    confidence_threshold: Optional[float] = None,
) -> str:
    job_id = str(uuid.uuid4())
    get_supabase().table("backtest_jobs").insert({
        "id":                   job_id,
        "user_id":              user_id,
        "status":               "queued",
        "tickers":              tickers,
        "start_date":           start_date,
        "end_date":             end_date,
        "ebc_mode":             ebc_mode,
        "philosophy_mode":      philosophy_mode,
        "confidence_threshold": confidence_threshold,
        "initial_capital":      10000.0,
        "progress":             0,
    }).execute()
    return job_id


def list_jobs(user_id: str) -> list[dict]:
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_job(job_id: str, user_id: str) -> Optional[dict]:
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    job = result.data[0]
    if job.get("mongo_id") and job["status"] in ("completed", "failed", "running", "cancelled"):
        doc = _get_results_col().find_one({"_id": ObjectId(job["mongo_id"])})
        if doc:
            doc["_id"] = str(doc["_id"])
            job["results"] = doc
    return job


def delete_job(job_id: str, user_id: str) -> Optional[bool]:
    """Returns None if not found, False if running, True if deleted."""
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("status,mongo_id")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    job = result.data[0]
    if job["status"] == "running":
        return False
    if job.get("mongo_id"):
        _get_results_col().delete_one({"_id": ObjectId(job["mongo_id"])})
    get_supabase().table("backtest_jobs").delete().eq("id", job_id).eq("user_id", user_id).execute()
    return True


# ── Status / progress updates ─────────────────────────────────────────────────

def update_job_status(
    job_id: str,
    status: str,
    progress: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    patch: dict = {"status": status}
    if progress is not None:
        patch["progress"] = progress
    if error_message:
        patch["error_message"] = error_message
    if status in ("completed", "failed", "cancelled"):
        patch["completed_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("backtest_jobs").update(patch).eq("id", job_id).execute()


def update_job_metrics(job_id: str, metrics: dict, mongo_id: str) -> None:
    get_supabase().table("backtest_jobs").update({
        "status":                   "completed",
        "mongo_id":                 mongo_id,
        "progress":                 100,
        "total_return":             metrics.get("cumulative_return"),
        "sharpe_ratio":             metrics.get("sharpe_ratio"),
        "max_drawdown":             metrics.get("max_drawdown"),
        "win_rate":                 metrics.get("win_rate"),
        "total_trades":             metrics.get("total_trades"),
        "signal_to_execution_rate": metrics.get("signal_to_execution_rate"),
        "completed_at":             datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


# ── MongoDB helpers ───────────────────────────────────────────────────────────

def create_results_doc(
    job_id: str,
    user_id: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
    philosophy_mode: str = "balanced",
    confidence_threshold: Optional[float] = None,
) -> str:
    doc = {
        "job_id":               job_id,
        "user_id":              user_id,
        "tickers":              tickers,
        "start_date":           start_date,
        "end_date":             end_date,
        "ebc_mode":             ebc_mode,
        "philosophy_mode":      philosophy_mode,
        "confidence_threshold": confidence_threshold,
        "initial_capital":      10000.0,
        "daily_runs":           [],
        "equity_curve":         [],
        "metrics":              {},
        "created_at":           datetime.now(timezone.utc),
    }
    result = _get_results_col().insert_one(doc)
    return str(result.inserted_id)


def set_mongo_id(job_id: str, mongo_id: str) -> None:
    get_supabase().table("backtest_jobs").update({"mongo_id": mongo_id}).eq("id", job_id).execute()


def append_day_results(
    mongo_id: str,
    day_runs: list[dict],
    equity_point: dict,
) -> None:
    _get_results_col().update_one(
        {"_id": ObjectId(mongo_id)},
        {"$push": {"daily_runs": {"$each": day_runs}, "equity_curve": equity_point}},
    )


def finalize_results(mongo_id: str, metrics: dict) -> None:
    _get_results_col().update_one(
        {"_id": ObjectId(mongo_id)},
        {"$set": {"metrics": metrics, "completed_at": datetime.now(timezone.utc)}},
    )


def save_checkpoint(
    mongo_id: str,
    last_completed_day: str,
    cash: float,
    positions: dict,  # {ticker: {"shares": float, "avg_cost": float, "entry_date": str}}
) -> None:
    """Persist virtual portfolio state so a failed job can resume from this day."""
    _get_results_col().update_one(
        {"_id": ObjectId(mongo_id)},
        {"$set": {"checkpoint": {
            "last_completed_day": last_completed_day,
            "cash": cash,
            "positions": positions,
            "saved_at": datetime.now(timezone.utc),
        }}},
    )


def get_checkpoint(mongo_id: str) -> dict | None:
    """Return the saved checkpoint dict, or None if no checkpoint exists."""
    doc = _get_results_col().find_one(
        {"_id": ObjectId(mongo_id)},
        {"checkpoint": 1},
    )
    return doc.get("checkpoint") if doc else None
