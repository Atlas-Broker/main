"""Risk Management Agent — position sizing, stop-loss, exposure limits."""

import time


MAX_RISK_PER_TRADE = 0.02   # 2% of portfolio per trade
STOP_LOSS_PCT = 0.05         # 5% stop-loss below entry


def assess(
    ticker: str,
    current_price: float,
    verdict: str,
    technical: dict,
    portfolio_value: float = 100_000.0,
    buying_power: float | None = None,
) -> dict:
    start = time.time()

    support = technical.get("key_levels", {}).get("support")
    resistance = technical.get("key_levels", {}).get("resistance")

    # Stop-loss: use support level if available, else fixed 5%
    if support and support < current_price:
        stop_loss = round(support * 0.99, 4)  # 1% below support
    else:
        stop_loss = round(current_price * (1 - STOP_LOSS_PCT), 4)

    risk_per_share = current_price - stop_loss
    max_loss_dollars = portfolio_value * MAX_RISK_PER_TRADE

    position_size = round(max_loss_dollars / risk_per_share, 0) if risk_per_share > 0 else 0
    position_value = round(position_size * current_price, 2)

    # Cap position value to 95% of buying power so we don't drain all buying power on one trade
    if buying_power is not None:
        position_value = min(position_value, buying_power * 0.95)
        position_size = round(position_value / current_price, 0)

    position_pct = round(position_value / portfolio_value * 100, 2)

    take_profit = round(current_price + (current_price - stop_loss) * 2, 4)  # 2:1 R/R
    risk_reward_ratio = round((take_profit - current_price) / (current_price - stop_loss), 2) if risk_per_share > 0 else 0

    return {
        "current_price": current_price,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "position_size": int(position_size),
        "position_value": position_value,
        "position_pct_of_portfolio": position_pct,
        "risk_reward_ratio": risk_reward_ratio,
        "max_loss_dollars": round(max_loss_dollars, 2),
        "reasoning": (
            f"Risk {MAX_RISK_PER_TRADE*100}% of portfolio (${portfolio_value:,.0f} portfolio value, "
            f"${max_loss_dollars:,.0f} max loss). "
            f"Stop at ${stop_loss} ({STOP_LOSS_PCT*100}% below entry). "
            f"Target ${take_profit} gives {risk_reward_ratio}:1 R/R."
        ),
        "latency_ms": round((time.time() - start) * 1000),
    }
