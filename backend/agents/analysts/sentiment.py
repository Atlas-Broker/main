"""Sentiment Analyst Agent — news, social media, market mood."""

import json
import time
from datetime import datetime, timezone

from google.genai import types
from agents.llm.factory import get_llm
from agents.philosophy import get_philosophy_prefix

_MAX_ARTICLES = 15


def _extract_article_metadata(news: list[dict]) -> list[dict]:
    """Extract title, ISO date, and URL from up to _MAX_ARTICLES news items."""
    articles = []
    for item in news[:_MAX_ARTICLES]:
        title = item.get("title", "")
        if not title:
            continue

        # yfinance live path: providerPublishTime is a unix timestamp
        # Alpaca path: published is already an ISO string
        raw_date = item.get("providerPublishTime") or item.get("published", "")
        if isinstance(raw_date, (int, float)) and raw_date:
            date_str = datetime.fromtimestamp(raw_date, tz=timezone.utc).strftime("%Y-%m-%d")
        elif isinstance(raw_date, str) and raw_date:
            # Truncate to date portion if it includes time
            date_str = raw_date[:10]
        else:
            date_str = ""

        url = item.get("link", item.get("url", ""))
        articles.append({"title": title, "date": date_str, "url": url})

    return articles


def analyse(ticker: str, news: list[dict], philosophy_mode: str | None = None) -> dict:
    start = time.time()
    philosophy_prefix = get_philosophy_prefix(philosophy_mode)

    headlines = [n["title"] for n in news if n.get("title")]
    news_articles = _extract_article_metadata(news)

    prompt = f"""{philosophy_prefix}You are a sentiment analyst for a swing trading system. Analyse recent news for {ticker} and return a JSON object.

Recent news headlines:
{json.dumps(headlines, indent=2)}

Return ONLY valid JSON with this exact structure:
{{
  "signal": "BUY" or "SELL" or "HOLD",
  "sentiment_score": <float between -1.0 (very negative) and 1.0 (very positive)>,
  "reasoning": "2-3 sentence sentiment analysis",
  "dominant_themes": ["theme1", "theme2"]
}}"""

    client, model_id = get_llm("quick")
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    result = json.loads(response.text)
    return {
        "signal": result.get("signal", "HOLD"),
        "sentiment_score": result.get("sentiment_score", 0.0),
        "dominant_themes": result.get("dominant_themes", []),
        "sources": ["news"],
        "headline_count": len(headlines),
        "reasoning": result.get("reasoning", ""),
        "news_articles": news_articles,
        "model": "gemini-2.0-flash-lite",
        "latency_ms": round((time.time() - start) * 1000),
    }
