"""Sentiment Analyst Agent — news, social media, market mood."""

import json
import time

from google.genai import types
from agents.llm.factory import get_llm


def analyse(ticker: str, news: list[dict]) -> dict:
    start = time.time()

    headlines = [n["title"] for n in news if n.get("title")]

    prompt = f"""You are a sentiment analyst for a swing trading system. Analyse recent news for {ticker} and return a JSON object.

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
        "model": "gemini-2.0-flash-lite",
        "latency_ms": round((time.time() - start) * 1000),
    }
