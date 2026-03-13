"""
Atlas Orchestrator — LangGraph pipeline coordinator.

Pipeline:
  Market Data → [Technical, Fundamental, Sentiment] → Synthesis → Risk → Portfolio → Execution Boundary
"""

# TODO (Phase 2): implement LangGraph state graph
# Stub for now — returns a mock signal for end-to-end wiring

from pydantic import BaseModel


class AgentSignal(BaseModel):
    ticker: str
    action: str  # BUY / SELL / HOLD
    confidence: float
    reasoning: str


def run_pipeline(ticker: str) -> AgentSignal:
    """Stub pipeline. Replace with LangGraph graph in Phase 2."""
    return AgentSignal(
        ticker=ticker,
        action="BUY",
        confidence=0.75,
        reasoning=f"[STUB] Mock signal for {ticker}. Real pipeline not yet implemented.",
    )
