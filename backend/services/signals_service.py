"""
Signals service — queries MongoDB for real pipeline traces and executes approvals.
"""
import logging
import os

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo import MongoClient, DESCENDING

load_dotenv()
logger = logging.getLogger(__name__)

_client: MongoClient | None = None


def _get_collection():
    global _client
    if _client is None:
        uri = os.environ["MONGODB_URI"]
        _client = MongoClient(uri)
    return _client[os.environ.get("MONGODB_DB_NAME", "atlas")]["reasoning_traces"]


def _trace_to_signal(trace: dict) -> dict:
    decision = trace.get("pipeline_run", {}).get("final_decision", {})
    risk = trace.get("pipeline_run", {}).get("risk", {})
    created = trace.get("created_at", "")
    return {
        "id": str(trace["_id"]),
        "ticker": trace.get("ticker", "UNKNOWN"),
        "action": decision.get("action", "HOLD"),
        "confidence": float(decision.get("confidence", 0.0)),
        "reasoning": decision.get("reasoning", ""),
        "boundary_mode": trace.get("boundary_mode", "advisory"),
        "risk": {
            "stop_loss": float(risk.get("stop_loss", 0)),
            "take_profit": float(risk.get("take_profit", 0)),
            "position_size": int(risk.get("position_size", 0)),
            "risk_reward_ratio": float(risk.get("risk_reward_ratio", 0)),
        },
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }


def get_recent_signals(limit: int = 20) -> list[dict]:
    col = _get_collection()
    traces = list(col.find({}, sort=[("created_at", DESCENDING)]).limit(limit))
    return [_trace_to_signal(t) for t in traces]


def approve_and_execute(signal_id: str) -> dict:
    """Look up trace by ID and place the order via Alpaca."""
    try:
        oid = ObjectId(signal_id)
    except InvalidId:
        raise ValueError(f"Invalid signal_id: {signal_id!r}")

    col = _get_collection()
    trace = col.find_one({"_id": oid})
    if not trace:
        raise ValueError(f"Signal {signal_id} not found")

    # Prevent double execution
    if trace.get("execution", {}).get("executed"):
        return {
            "status": "already_executed",
            "order_id": trace["execution"].get("order_id"),
            "message": "Signal was already executed.",
        }

    decision = trace.get("pipeline_run", {}).get("final_decision", {})
    ticker = trace.get("ticker", "")
    action = decision.get("action", "HOLD")

    if action == "HOLD":
        return {"status": "skipped", "message": "HOLD signal — no order placed."}

    from broker.factory import get_broker
    broker = get_broker()
    order = broker.place_order(ticker, action, notional=1000.0)

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
    }
