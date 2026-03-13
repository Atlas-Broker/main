"""Technical Analyst Agent — price action, indicators, chart patterns."""

# TODO (Phase 2): implement with LangGraph node + Gemini Flash


def analyse(ticker: str, ohlcv: list[dict]) -> dict:
    """Stub. Returns mock technical analysis."""
    return {
        "ticker": ticker,
        "signal": "BUY",
        "indicators": {"rsi": 42.5, "macd": "bullish_cross", "sma_50_200": "golden_cross"},
        "reasoning": f"[STUB] Mock technical analysis for {ticker}.",
    }
