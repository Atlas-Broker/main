"""Technical Analyst Agent — price action, indicators, chart patterns."""

import json
import time

from google.genai import types
from agents.llm.factory import get_llm
from agents.philosophy import get_philosophy_prefix


def _compute_indicators(ohlcv: list[dict]) -> dict:
    if len(ohlcv) < 20:
        return {}

    closes = [r["close"] for r in ohlcv]
    volumes = [r["volume"] for r in ohlcv]

    def sma(data, n):
        return round(sum(data[-n:]) / n, 4) if len(data) >= n else None

    # RSI-14
    gains, losses = [], []
    for i in range(1, min(15, len(closes))):
        delta = closes[-i] - closes[-(i + 1)]
        (gains if delta > 0 else losses).append(abs(delta))
    avg_gain = sum(gains) / 14 if gains else 0
    avg_loss = sum(losses) / 14 if losses else 0.001
    rsi = round(100 - (100 / (1 + avg_gain / avg_loss)), 2)

    sma20 = sma(closes, 20)
    sma50 = sma(closes, 50)
    sma200 = sma(closes, 200)

    price_5d_pct = round((closes[-1] - closes[-6]) / closes[-6] * 100, 2) if len(closes) >= 6 else None
    price_20d_pct = round((closes[-1] - closes[-21]) / closes[-21] * 100, 2) if len(closes) >= 21 else None

    avg_vol_20 = sma(volumes, 20)
    vol_ratio = round(volumes[-1] / avg_vol_20, 2) if avg_vol_20 else None

    return {
        "current_price": closes[-1],
        "rsi_14": rsi,
        "sma_20": sma20,
        "sma_50": sma50,
        "sma_200": sma200,
        "price_vs_sma50_pct": round((closes[-1] - sma50) / sma50 * 100, 2) if sma50 else None,
        "price_vs_sma200_pct": round((closes[-1] - sma200) / sma200 * 100, 2) if sma200 else None,
        "price_5d_pct": price_5d_pct,
        "price_20d_pct": price_20d_pct,
        "volume_ratio_vs_20d_avg": vol_ratio,
    }


def analyse(ticker: str, ohlcv: list[dict], philosophy_mode: str | None = None) -> dict:
    start = time.time()
    indicators = _compute_indicators(ohlcv)
    philosophy_prefix = get_philosophy_prefix(philosophy_mode)

    prompt = f"""{philosophy_prefix}You are a technical analyst for a swing trading system. Analyse {ticker} and return a JSON object.

Computed indicators:
{json.dumps(indicators, indent=2)}

Recent price history (last 10 days):
{json.dumps(ohlcv[-10:], indent=2)}

Return ONLY valid JSON with this exact structure:
{{
  "signal": "BUY" or "SELL" or "HOLD",
  "reasoning": "2-3 sentence technical analysis focused on swing trading",
  "key_levels": {{"support": <float>, "resistance": <float>}},
  "trend": "bullish" or "bearish" or "neutral"
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
        "indicators": indicators,
        "key_levels": result.get("key_levels", {}),
        "trend": result.get("trend", "neutral"),
        "reasoning": result.get("reasoning", ""),
        "model": "gemini-2.0-flash-lite",
        "latency_ms": round((time.time() - start) * 1000),
    }
