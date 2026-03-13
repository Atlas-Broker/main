"""Sentiment Analyst Agent — news, social media, market mood."""

# TODO (Phase 2): implement with LangGraph node + Gemini Flash


def analyse(ticker: str) -> dict:
    """Stub. Returns mock sentiment analysis."""
    return {
        "ticker": ticker,
        "signal": "BUY",
        "sentiment_score": 0.68,
        "sources": ["earnings_call", "news", "social"],
        "reasoning": f"[STUB] Mock sentiment analysis for {ticker}.",
    }
