"""
Atlas Orchestrator — sequential pipeline coordinator.

Pipeline:
  Market Data (yfinance)
    → [Technical, Fundamental, Sentiment] analysts
    → Synthesis
    → Risk
    → Portfolio Decision
    → Save trace to MongoDB
    → Return structured signal

Phase 3: replace with LangGraph state graph for parallel analyst execution.
"""

import time

from pydantic import BaseModel

from agents.data import market
from agents.analysts import technical, fundamental, sentiment
from agents.synthesis import agent as synthesis_agent
from agents.risk import agent as risk_agent
from agents.portfolio import agent as portfolio_agent
from agents.memory import trace as trace_store


class AgentSignal(BaseModel):
    ticker: str
    action: str          # BUY / SELL / HOLD
    confidence: float
    reasoning: str
    trace_id: str
    boundary_mode: str
    risk: dict
    latency_ms: int


def run_pipeline(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
) -> AgentSignal:
    pipeline_start = time.time()

    # 1. Fetch market data
    ohlcv = market.fetch_ohlcv(ticker)
    info = market.fetch_info(ticker)
    news = market.fetch_news(ticker)

    current_price = info.get("currentPrice") or (ohlcv[-1]["close"] if ohlcv else 0.0)

    # 2. Run analysts
    tech = technical.analyse(ticker, ohlcv)
    fund = fundamental.analyse(ticker, info)
    sent = sentiment.analyse(ticker, news)

    # 3. Synthesis
    synth = synthesis_agent.synthesize(ticker, tech, fund, sent)

    # 4. Risk assessment
    risk = risk_agent.assess(ticker, current_price, synth["verdict"], tech)

    # 5. Final portfolio decision
    decision = portfolio_agent.decide(ticker, synth, risk)

    # 6. Save reasoning trace to MongoDB
    trace_id = trace_store.save_trace(
        ticker=ticker,
        user_id=user_id,
        boundary_mode=boundary_mode,
        technical=tech,
        fundamental=fund,
        sentiment=sent,
        synthesis=synth,
        risk=risk,
        final_decision=decision,
    )

    total_ms = round((time.time() - pipeline_start) * 1000)

    return AgentSignal(
        ticker=ticker,
        action=decision["action"],
        confidence=decision["confidence"],
        reasoning=decision["reasoning"],
        trace_id=trace_id,
        boundary_mode=boundary_mode,
        risk={
            "stop_loss": risk["stop_loss"],
            "take_profit": risk["take_profit"],
            "position_size": risk["position_size"],
            "risk_reward_ratio": risk["risk_reward_ratio"],
        },
        latency_ms=total_ms,
    )
