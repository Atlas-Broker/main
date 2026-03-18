"""Reasoning trace persistence — saves pipeline runs to MongoDB Atlas."""

import os
from datetime import datetime, timezone

from pymongo import MongoClient

_client: MongoClient | None = None


def _get_collection():
    global _client
    if _client is None:
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            raise EnvironmentError("MONGODB_URI is not set")
        _client = MongoClient(uri)
    db_name = os.environ.get("MONGODB_DB_NAME", "atlas")
    return _client[db_name]["reasoning_traces"]


def save_trace(
    ticker: str,
    user_id: str,
    boundary_mode: str,
    technical: dict,
    fundamental: dict,
    sentiment: dict,
    synthesis: dict,
    risk: dict,
    final_decision: dict,
) -> str:
    doc = {
        "ticker": ticker,
        "user_id": user_id,
        "boundary_mode": boundary_mode,
        "created_at": datetime.now(timezone.utc),
        "pipeline_run": {
            "technical": technical,
            "fundamental": fundamental,
            "sentiment": sentiment,
            "synthesis": synthesis,
            "risk": risk,
            "final_decision": final_decision,
        },
    }
    result = _get_collection().insert_one(doc)
    return str(result.inserted_id)
