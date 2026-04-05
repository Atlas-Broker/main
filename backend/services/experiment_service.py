"""Experiment CRUD — Supabase backtest_experiments table."""
import uuid
from typing import Optional

from db.supabase import get_supabase


def create_experiment(
    user_id: str,
    name: str,
    experiment_type: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
) -> str:
    exp_id = str(uuid.uuid4())
    get_supabase().table("backtest_experiments").insert({
        "id":              exp_id,
        "user_id":         user_id,
        "name":            name,
        "experiment_type": experiment_type,
        "tickers":         tickers,
        "start_date":      start_date,
        "end_date":        end_date,
        "ebc_mode":        ebc_mode,
    }).execute()
    return exp_id


def list_experiments(user_id: str) -> list[dict]:
    result = (
        get_supabase()
        .table("backtest_experiments")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_experiment(exp_id: str, user_id: str) -> Optional[dict]:
    result = (
        get_supabase()
        .table("backtest_experiments")
        .select("*")
        .eq("id", exp_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None


def delete_experiment(exp_id: str, user_id: str) -> Optional[bool]:
    """Returns None if not found, True if deleted."""
    existing = (
        get_supabase()
        .table("backtest_experiments")
        .select("id")
        .eq("id", exp_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        return None
    get_supabase().table("backtest_experiments").delete().eq("id", exp_id).eq("user_id", user_id).execute()
    return True
