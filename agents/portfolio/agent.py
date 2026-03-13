"""Portfolio Decision Agent — final BUY/SELL/HOLD with structured reasoning trace."""

import json
import time

from google.genai import types
from agents.llm.factory import get_llm


def decide(ticker: str, synthesis: dict, risk: dict) -> dict:
    start = time.time()

    prompt = f"""You are the final decision agent for a swing trading system. Make the final trade decision for {ticker}.

Synthesis verdict: {synthesis.get("verdict")}
Bull case: {synthesis.get("bull_case")}
Bear case: {synthesis.get("bear_case")}
Synthesis reasoning: {synthesis.get("reasoning")}

Risk assessment:
- Entry price: ${risk.get("current_price")}
- Stop-loss: ${risk.get("stop_loss")}
- Take-profit: ${risk.get("take_profit")}
- Position size: {risk.get("position_size")} shares (${risk.get("position_value"):,})
- Risk/reward ratio: {risk.get("risk_reward_ratio")}:1
- Max loss: ${risk.get("max_loss_dollars")}

Make a final decision. Return ONLY valid JSON:
{{
  "action": "BUY" or "SELL" or "HOLD",
  "confidence": <float between 0.0 and 1.0>,
  "reasoning": "2-3 sentence final decision rationale integrating synthesis and risk"
}}"""

    client, model_id = get_llm("deep")
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    result = json.loads(response.text)
    return {
        "action": result.get("action", "HOLD"),
        "confidence": round(float(result.get("confidence", 0.5)), 3),
        "reasoning": result.get("reasoning", ""),
        "model": "gemini-2.0-flash-lite",
        "latency_ms": round((time.time() - start) * 1000),
    }
