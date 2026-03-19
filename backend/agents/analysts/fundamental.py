"""Fundamental Analyst Agent — financials, earnings, valuations."""

import json
import time

from google.genai import types
from agents.llm.factory import get_llm
from agents.philosophy import get_philosophy_prefix


def analyse(ticker: str, info: dict, philosophy_mode: str | None = None) -> dict:
    start = time.time()
    philosophy_prefix = get_philosophy_prefix(philosophy_mode)

    metrics = {
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "price_to_book": info.get("priceToBook"),
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "profit_margins": info.get("profitMargins"),
        "debt_to_equity": info.get("debtToEquity"),
        "return_on_equity": info.get("returnOnEquity"),
        "current_ratio": info.get("currentRatio"),
        "analyst_target": info.get("targetMeanPrice"),
        "analyst_recommendation": info.get("recommendationMean"),
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "current_price": info.get("currentPrice"),
    }

    prompt = f"""{philosophy_prefix}You are a fundamental analyst for a swing trading system. Analyse {ticker} and return a JSON object.

Company: {info.get("shortName", ticker)} | Sector: {info.get("sector")} | Industry: {info.get("industry")}

Key metrics:
{json.dumps(metrics, indent=2)}

Return ONLY valid JSON with this exact structure:
{{
  "signal": "BUY" or "SELL" or "HOLD",
  "reasoning": "2-3 sentence fundamental analysis focused on valuation and growth",
  "valuation": "undervalued" or "fairly_valued" or "overvalued",
  "upside_to_target_pct": <float or null>
}}"""

    client, model_id = get_llm("quick")
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    result = json.loads(response.text)

    current = metrics.get("current_price")
    target = metrics.get("analyst_target")
    upside = round((target - current) / current * 100, 2) if current and target else result.get("upside_to_target_pct")

    return {
        "signal": result.get("signal", "HOLD"),
        "metrics": metrics,
        "valuation": result.get("valuation", "fairly_valued"),
        "upside_to_target_pct": upside,
        "reasoning": result.get("reasoning", ""),
        "model": "gemini-2.0-flash-lite",
        "latency_ms": round((time.time() - start) * 1000),
    }
