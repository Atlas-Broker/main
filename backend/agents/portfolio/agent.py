"""Portfolio Decision Agent — final BUY/SELL/HOLD with structured reasoning trace."""

import json
import time

from google.genai import types
from agents.llm.factory import get_llm

MAX_POSITION_PCT  = 0.15   # must match simulator
MIN_CASH_RESERVE_PCT = 0.10


def _build_portfolio_context(
    ticker: str,
    current_positions: dict | None,
    account_info: dict | None,
) -> str:
    """Build a rich portfolio context block for the prompt."""
    if not account_info:
        return ""

    portfolio_value = account_info.get("portfolio_value", 100_000.0)
    cash = account_info.get("buying_power", portfolio_value)
    cash_pct = (cash / portfolio_value * 100) if portfolio_value > 0 else 0
    min_cash = portfolio_value * MIN_CASH_RESERVE_PCT
    max_position = portfolio_value * MAX_POSITION_PCT

    lines = [
        "\nPORTFOLIO STATUS:",
        f"  Total portfolio:   ${portfolio_value:>12,.0f}",
        f"  Cash available:    ${cash:>12,.0f}  ({cash_pct:.1f}% of portfolio)",
        f"  Min cash reserve:  ${min_cash:>12,.0f}  (10% — hard floor, never go below)",
        f"  Max per position:  ${max_position:>12,.0f}  (15% per ticker)",
    ]

    if cash_pct < 12:
        lines.append(f"\n  ⚠️  CASH CRITICALLY LOW ({cash_pct:.1f}%). Prefer HOLD over BUY.")
    elif cash_pct < 20:
        lines.append(f"\n  ⚠️  Cash is below 20%. Be selective — only the strongest conviction BUY.")

    if current_positions:
        lines.append("\nCURRENT POSITIONS (cost basis):")
        for t, pos in current_positions.items():
            shares = pos.get("shares", pos.get("qty", 0))
            avg_cost = pos.get("avg_cost", pos.get("avg_entry_price", 0))
            pos_value = shares * avg_cost
            pos_pct = (pos_value / portfolio_value * 100) if portfolio_value > 0 else 0
            flag = " ⚠️ HIGH CONCENTRATION" if pos_pct > 12 else ""
            lines.append(f"  {t}: {shares:.4f} sh @ ${avg_cost:.2f}  ≈ ${pos_value:,.0f} ({pos_pct:.1f}%){flag}")

        # Check if ticker already has a large position
        if ticker in current_positions:
            pos = current_positions[ticker]
            shares = pos.get("shares", 0)
            avg_cost = pos.get("avg_cost", 0)
            pos_value = shares * avg_cost
            pos_pct = (pos_value / portfolio_value * 100) if portfolio_value > 0 else 0
            if pos_pct >= MAX_POSITION_PCT * 100:
                lines.append(f"\n  ⛔  {ticker} is already at the 15% cap. BUY is blocked — output HOLD.")
            elif pos_pct >= 10:
                lines.append(f"\n  ⚠️  {ticker} already at {pos_pct:.0f}%. Adding more increases concentration risk.")
    else:
        lines.append("\nCURRENT POSITIONS: none (fully in cash)")

    return "\n".join(lines)


def decide(
    ticker: str,
    synthesis: dict,
    risk: dict,
    current_positions: dict | None = None,
    account_info: dict | None = None,
) -> dict:
    start = time.time()

    portfolio_block = _build_portfolio_context(ticker, current_positions, account_info)

    prompt = f"""You are the final decision agent for a swing trading system. Make the final trade decision for {ticker}.

MARKET ANALYSIS:
Synthesis verdict: {synthesis.get("verdict")}
Bull case: {synthesis.get("bull_case")}
Bear case: {synthesis.get("bear_case")}
Reasoning: {synthesis.get("reasoning")}

RISK PARAMETERS:
- Entry price:      ${risk.get("current_price")}
- Stop-loss:        ${risk.get("stop_loss")}  (exit if thesis is wrong)
- Take-profit:      ${risk.get("take_profit")}
- Suggested trade:  {risk.get("position_size")} shares  (${risk.get("position_value"):,})
- Risk/reward:      {risk.get("risk_reward_ratio")}:1
- Max loss:         ${risk.get("max_loss_dollars")}
{portfolio_block}

DECISION RULES (hard constraints — override any bullish signal):
1. If cash after this BUY would fall below 10% of portfolio → output HOLD, not BUY.
2. If {ticker} already occupies ≥15% of portfolio at cost basis → output HOLD, not BUY.
3. If synthesis verdict is bearish and there is no existing {ticker} position → output HOLD, not SELL.
4. Only output SELL if the position exists and you want to exit it.
5. Prefer a small, high-conviction position over a large, uncertain one.

Return ONLY valid JSON:
{{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": <float 0.0–1.0>,
  "reasoning": "2-3 sentences integrating market signal, risk, and portfolio constraints"
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
        "latency_ms": round((time.time() - start) * 1000),
    }
