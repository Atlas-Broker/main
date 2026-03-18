"""Synthesis Agent — aggregates analyst reports, runs bull/bear debate, produces unified thesis."""

import json
import time

from google.genai import types
from agents.llm.factory import get_llm


def synthesize(ticker: str, technical: dict, fundamental: dict, sentiment: dict) -> dict:
    start = time.time()

    signals = [technical.get("signal"), fundamental.get("signal"), sentiment.get("signal")]
    signal_summary = f"Technical: {signals[0]} | Fundamental: {signals[1]} | Sentiment: {signals[2]}"

    prompt = f"""You are a synthesis agent aggregating three analyst reports for {ticker} into a unified trading thesis.

{signal_summary}

Technical analysis:
{technical.get("reasoning")}
Trend: {technical.get("trend")} | Key levels: {json.dumps(technical.get("key_levels", {}))}

Fundamental analysis:
{fundamental.get("reasoning")}
Valuation: {fundamental.get("valuation")} | Upside to target: {fundamental.get("upside_to_target_pct")}%

Sentiment analysis:
{sentiment.get("reasoning")}
Sentiment score: {sentiment.get("sentiment_score")} | Themes: {sentiment.get("dominant_themes")}

Construct a bull case and bear case, then give a verdict. Return ONLY valid JSON:
{{
  "bull_case": "strongest argument for buying",
  "bear_case": "strongest argument against buying",
  "verdict": "BUY" or "SELL" or "HOLD",
  "reasoning": "2-3 sentence synthesis weighing all three analysts"
}}"""

    client, model_id = get_llm("deep")
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    result = json.loads(response.text)
    return {
        "bull_case": result.get("bull_case", ""),
        "bear_case": result.get("bear_case", ""),
        "verdict": result.get("verdict", "HOLD"),
        "reasoning": result.get("reasoning", ""),
        "model": "gemini-2.0-flash-lite",
        "latency_ms": round((time.time() - start) * 1000),
    }
