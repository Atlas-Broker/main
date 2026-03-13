"""Fundamental Analyst Agent — financials, earnings, valuations."""

# TODO (Phase 2): implement with LangGraph node + Gemini Flash


def analyse(ticker: str) -> dict:
    """Stub. Returns mock fundamental analysis."""
    return {
        "ticker": ticker,
        "signal": "HOLD",
        "metrics": {"pe_ratio": 28.5, "revenue_growth": 0.12, "debt_to_equity": 0.45},
        "reasoning": f"[STUB] Mock fundamental analysis for {ticker}.",
    }
