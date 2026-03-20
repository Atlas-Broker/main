# backend/services/signals_service.py
"""
Signals service — queries MongoDB for real pipeline traces and executes approvals.
"""
import logging
import os
from datetime import datetime, timezone
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo import MongoClient, DESCENDING

load_dotenv()
logger = logging.getLogger(__name__)

_client: MongoClient | None = None


class AlreadyExecutedError(Exception):
    """Raised when a signal has already been executed."""


def _get_collection():
    global _client
    if _client is None:
        uri = os.environ["MONGODB_URI"]
        _client = MongoClient(uri)
    return _client[os.environ.get("MONGODB_DB_NAME", "atlas")]["reasoning_traces"]


def _trace_to_signal(trace: dict) -> dict:
    pipeline_run = trace.get("pipeline_run", {})
    decision = pipeline_run.get("final_decision", {})
    risk = pipeline_run.get("risk", {})
    created = trace.get("created_at", "")
    execution = trace.get("execution", {})
    boundary_mode = trace.get("boundary_mode", "advisory")

    if execution.get("rejected") is True:
        status = "rejected"
    elif execution.get("executed") is True:
        status = "executed"
    else:
        status = "signal"

    return {
        "id": str(trace["_id"]),
        "ticker": trace.get("ticker", "UNKNOWN"),
        "action": decision.get("action", "HOLD"),
        "confidence": float(decision.get("confidence", 0.0)),
        "reasoning": decision.get("reasoning", ""),
        "boundary_mode": boundary_mode,
        "status": status,
        "risk": {
            "stop_loss": float(risk.get("stop_loss", 0)),
            "take_profit": float(risk.get("take_profit", 0)),
            "position_size": int(risk.get("position_size", 0)),
            "risk_reward_ratio": float(risk.get("risk_reward_ratio", 0)),
        },
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        "trace": {
            "technical": pipeline_run.get("technical", {}),
            "fundamental": pipeline_run.get("fundamental", {}),
            "sentiment": pipeline_run.get("sentiment", {}),
            "synthesis": pipeline_run.get("synthesis", {}),
        },
        "execution": {
            "executed": execution.get("executed", False),
            "rejected": execution.get("rejected", False),
            "order_id": execution.get("order_id"),
            "status": execution.get("status", "pending"),
        },
    }


def get_recent_signals(user_id: str, limit: int = 20) -> list[dict]:
    """Return recent signals for the given user only."""
    col = _get_collection()
    traces = list(
        col.find({"user_id": user_id}, sort=[("created_at", DESCENDING)]).limit(limit)
    )
    return [_trace_to_signal(t) for t in traces]


def approve_and_execute(signal_id: str, user_id: str) -> dict:
    """
    Look up trace by ID, verify ownership, place the order, then persist to Supabase.
    Raises:
        ValueError           — invalid signal_id or not found
        PermissionError      — signal belongs to a different user (presented as 404)
        AlreadyExecutedError — signal was already executed
    """
    try:
        oid = ObjectId(signal_id)
    except InvalidId:
        raise ValueError(f"Invalid signal_id: {signal_id!r}")

    col = _get_collection()
    trace = col.find_one({"_id": oid})

    if not trace:
        raise ValueError(f"Signal {signal_id} not found")

    # Ownership check — 404 to caller (don't reveal existence to wrong user)
    if trace.get("user_id") != user_id:
        raise ValueError(f"Signal {signal_id} not found")

    # Idempotency guard
    if trace.get("execution", {}).get("executed"):
        raise AlreadyExecutedError("Signal has already been executed.")

    decision = trace.get("pipeline_run", {}).get("final_decision", {})
    ticker = trace.get("ticker", "")
    action = decision.get("action", "HOLD")
    boundary_mode = trace.get("boundary_mode", "advisory")

    if action == "HOLD":
        return {"status": "skipped", "message": "HOLD signal — no order placed."}

    from broker.factory import get_broker_for_user
    broker = get_broker_for_user(user_id)
    if broker is None:
        raise ValueError(
            "No broker connected. Connect your Alpaca account in Settings before approving signals."
        )
    order = broker.place_order(ticker, action, notional=1000.0)

    # Persist to Supabase — failure must not fail the HTTP response
    supabase_sync = True
    try:
        from services.portfolio_service import get_or_create_portfolio
        from services.trade_service import record_trade, sync_positions

        portfolio_id = get_or_create_portfolio(user_id)
        record_trade(
            user_id=user_id,
            portfolio_id=portfolio_id,
            ticker=ticker,
            action=action,
            boundary_mode=boundary_mode,
            signal_id=signal_id,
            order=order,
        )
        sync_positions(user_id, portfolio_id, ticker, action, order)
    except Exception as exc:
        logger.error(
            "Supabase write failed after order placement — user=%r ticker=%r order_id=%r error=%r",
            user_id, ticker, order.get("order_id"), exc,
        )
        supabase_sync = False

    col.update_one(
        {"_id": oid},
        {"$set": {"execution": {"executed": True, "order_id": order["order_id"], "status": "filled"}}},
    )

    logger.info("Approved and executed: %s %s → order %s", action, ticker, order["order_id"])
    return {
        "status": "executed",
        "order_id": order["order_id"],
        "ticker": ticker,
        "action": action,
        "message": f"Order placed: {action} $1000 of {ticker}.",
        "supabase_sync": supabase_sync,
    }


def reject_signal(signal_id: str, user_id: str) -> dict:
    """Reject a signal and persist the decision to MongoDB.

    Raises:
        HTTPException 400 — invalid ObjectId format
        HTTPException 404 — signal not found or not owned by user
        HTTPException 409 — signal has already been executed
    """
    from fastapi import HTTPException

    try:
        oid = ObjectId(signal_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid signal ID format")

    col = _get_collection()

    # user_id filter in find_one enforces ownership (returns None for wrong user)
    trace = col.find_one({"_id": oid, "user_id": user_id})
    if not trace:
        raise HTTPException(status_code=404, detail="Signal not found")

    execution = trace.get("execution", {})

    # Guard: cannot reject an already-executed signal
    if execution.get("executed"):
        raise HTTPException(status_code=409, detail="Signal has already been executed")

    # Idempotency: already rejected — return success without overwriting rejected_at
    if execution.get("rejected"):
        return {
            "signal_id": signal_id,
            "status": "rejected",
            "message": "Signal already rejected",
        }

    # Persist rejection using dot-notation $set to merge into execution subdoc.
    # Dot-notation preserves existing keys like execution.order_id.
    col.update_one(
        {"_id": oid},
        {
            "$set": {
                "execution.rejected": True,
                "execution.rejected_at": datetime.now(timezone.utc).isoformat(),
                "execution.status": "rejected",
            }
        },
    )

    logger.info("Signal rejected: %s by user %s", signal_id, user_id)
    return {
        "signal_id": signal_id,
        "status": "rejected",
        "message": "Signal rejected and logged",
    }
