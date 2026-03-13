"""
Atlas Orchestrator — thin wrapper over the LangGraph pipeline.

The graph (agents/graph.py) handles all agent coordination including
parallel analyst execution. This module provides a stable import
surface for backend/services/pipeline_service.py.
"""
import asyncio
import time

from pydantic import BaseModel

from agents.graph import get_graph


class AgentSignal(BaseModel):
    ticker: str
    action: str          # BUY / SELL / HOLD
    confidence: float
    reasoning: str
    trace_id: str
    boundary_mode: str
    risk: dict
    latency_ms: int


async def run_pipeline_async(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
) -> AgentSignal:
    start = time.time()
    graph = get_graph()

    initial_state = {
        "ticker": ticker,
        "user_id": user_id,
        "boundary_mode": boundary_mode,
        "analyst_outputs": {},
        "synthesis": None,
        "risk": None,
        "portfolio_decision": None,
        "trace_id": None,
    }

    final_state = await graph.ainvoke(initial_state)

    decision = final_state["portfolio_decision"]
    risk = final_state["risk"]

    return AgentSignal(
        ticker=ticker,
        action=decision["action"],
        confidence=decision["confidence"],
        reasoning=decision["reasoning"],
        trace_id=final_state.get("trace_id", ""),
        boundary_mode=boundary_mode,
        risk={
            "stop_loss": risk["stop_loss"],
            "take_profit": risk["take_profit"],
            "position_size": risk["position_size"],
            "risk_reward_ratio": risk["risk_reward_ratio"],
        },
        latency_ms=round((time.time() - start) * 1000),
    )


def run_pipeline(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
) -> AgentSignal:
    """Sync wrapper — safe to call from FastAPI sync route handlers."""
    return asyncio.run(run_pipeline_async(ticker, boundary_mode, user_id))
