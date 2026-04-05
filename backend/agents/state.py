"""
AgentState — the shared TypedDict passed between all LangGraph nodes.

Each node reads what it needs and writes only its own keys.
The `analyst_outputs` key uses operator.or_ as a reducer so parallel
analyst nodes can each write their result without overwriting each other.
"""
from __future__ import annotations

import operator
from typing import Annotated, TypedDict


class AgentState(TypedDict):
    # Inputs
    ticker: str
    user_id: str
    boundary_mode: str
    as_of_date: str | None
    philosophy_mode: str | None  # 'balanced', 'value', 'momentum', 'macro' — None = balanced

    # Market data (populated by fetch_data node)
    ohlcv: list[dict]
    info: dict
    news: list[dict]
    current_price: float

    # Analyst outputs — merged by operator.or_ so parallel nodes
    # can each add their key without overwriting each other
    analyst_outputs: Annotated[dict, operator.or_]

    # Current live positions — fetched before portfolio node, None if unavailable
    current_positions: dict | None

    # Account info — fetched in fetch_account node (after synthesis, before risk)
    account_info: dict | None   # fetched before risk node; keys: portfolio_value, buying_power, equity

    # Sequential stage outputs
    synthesis: dict | None
    risk: dict | None
    portfolio_decision: dict | None
    trace_id: str | None
