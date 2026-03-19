"""
LangGraph pipeline for Atlas.

Graph shape:
  fetch_data
    → [technical_analyst, fundamental_analyst, sentiment_analyst]  (parallel)
    → synthesis → risk → portfolio → save_trace
"""
import asyncio

from langgraph.graph import StateGraph, START, END

from agents.state import AgentState
from agents.data import market
from agents.analysts import technical, fundamental, sentiment
from agents.synthesis import agent as synthesis_agent
from agents.risk import agent as risk_agent
from agents.portfolio import agent as portfolio_agent
from agents.memory import trace as trace_store


# ── Node functions ──────────────────────────────────────────────────────────
# Each node receives the full state and returns a dict of keys to update.

async def fetch_data(state: AgentState) -> dict:
    ticker = state["ticker"]
    as_of_date = state.get("as_of_date")
    ohlcv, info, news = await asyncio.gather(
        asyncio.to_thread(market.fetch_ohlcv, ticker, as_of_date=as_of_date),
        asyncio.to_thread(market.fetch_info, ticker),
        asyncio.to_thread(market.fetch_news, ticker),
    )
    current_price = info.get("currentPrice") or (ohlcv[-1]["close"] if ohlcv else 0.0)
    return {
        "ohlcv": ohlcv,
        "info": info,
        "news": news,
        "current_price": current_price,
        "analyst_outputs": {},
        "as_of_date": as_of_date,  # preserve for downstream nodes
    }


async def run_technical(state: AgentState) -> dict:
    result = await asyncio.to_thread(technical.analyse, state["ticker"], state["ohlcv"])
    return {"analyst_outputs": {"technical": result}}


async def run_fundamental(state: AgentState) -> dict:
    result = await asyncio.to_thread(fundamental.analyse, state["ticker"], state["info"])
    return {"analyst_outputs": {"fundamental": result}}


async def run_sentiment(state: AgentState) -> dict:
    result = await asyncio.to_thread(sentiment.analyse, state["ticker"], state["news"])
    return {"analyst_outputs": {"sentiment": result}}


async def run_synthesis(state: AgentState) -> dict:
    outputs = state["analyst_outputs"]
    result = await asyncio.to_thread(
        synthesis_agent.synthesize,
        state["ticker"],
        outputs.get("technical", {}),
        outputs.get("fundamental", {}),
        outputs.get("sentiment", {}),
    )
    return {"synthesis": result}


async def run_risk(state: AgentState) -> dict:
    result = await asyncio.to_thread(
        risk_agent.assess,
        state["ticker"],
        state["current_price"],
        state["synthesis"]["verdict"],
        state["analyst_outputs"].get("technical", {}),
    )
    return {"risk": result}


async def run_portfolio(state: AgentState) -> dict:
    result = await asyncio.to_thread(
        portfolio_agent.decide,
        state["ticker"],
        state["synthesis"],
        state["risk"],
    )
    return {"portfolio_decision": result}


async def save_trace(state: AgentState) -> dict:
    outputs = state["analyst_outputs"]
    trace_id = await asyncio.to_thread(
        trace_store.save_trace,
        ticker=state["ticker"],
        user_id=state["user_id"],
        boundary_mode=state["boundary_mode"],
        technical=outputs.get("technical", {}),
        fundamental=outputs.get("fundamental", {}),
        sentiment=outputs.get("sentiment", {}),
        synthesis=state["synthesis"],
        risk=state["risk"],
        final_decision=state["portfolio_decision"],
    )
    return {"trace_id": trace_id}


# ── Graph assembly ──────────────────────────────────────────────────────────

def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("fetch_data", fetch_data)
    builder.add_node("technical_analyst", run_technical)
    builder.add_node("fundamental_analyst", run_fundamental)
    builder.add_node("sentiment_analyst", run_sentiment)
    builder.add_node("synthesis", run_synthesis)
    builder.add_node("risk", run_risk)
    builder.add_node("portfolio", run_portfolio)
    builder.add_node("save_trace", save_trace)

    # Fan-out: fetch_data → all three analysts in parallel
    builder.add_edge(START, "fetch_data")
    builder.add_edge("fetch_data", "technical_analyst")
    builder.add_edge("fetch_data", "fundamental_analyst")
    builder.add_edge("fetch_data", "sentiment_analyst")

    # Fan-in: all three analysts → synthesis (LangGraph waits for all three)
    builder.add_edge("technical_analyst", "synthesis")
    builder.add_edge("fundamental_analyst", "synthesis")
    builder.add_edge("sentiment_analyst", "synthesis")

    # Sequential tail
    builder.add_edge("synthesis", "risk")
    builder.add_edge("risk", "portfolio")
    builder.add_edge("portfolio", "save_trace")
    builder.add_edge("save_trace", END)

    return builder.compile()


# Singleton — compile once, reuse across requests
_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph
