"""
Virtual portfolio simulator for backtesting.

Mirrors EBC execution thresholds from boundary/modes.py without
touching the real broker. Uses a single shared capital pool.
"""
from __future__ import annotations
from dataclasses import dataclass, field

NOTIONAL = 1000.0  # $1,000 per trade — matches live EBC config

CONFIDENCE_THRESHOLDS: dict[str, float | None] = {
    "advisory":              None,   # never execute
    "conditional":           0.60,
    "autonomous":            0.65,
    "autonomous_guardrail":  0.65,
}


@dataclass
class Position:
    ticker: str
    shares: float
    avg_cost: float
    entry_date: str


@dataclass
class VirtualPortfolio:
    initial_capital: float = 10000.0
    cash: float = field(init=False)
    positions: dict[str, Position] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.cash = self.initial_capital

    def process(
        self,
        date: str,
        ticker: str,
        action: str,
        confidence: float,
        ebc_mode: str,
        execution_price: float | None,
        is_last_day: bool,
    ) -> dict:
        threshold = CONFIDENCE_THRESHOLDS.get(ebc_mode)

        if threshold is None:
            return {"executed": False, "reason": "advisory_mode"}
        if is_last_day:
            return {"executed": False, "skipped_reason": "end_of_range"}
        if action == "HOLD":
            return {"executed": False, "reason": "hold_signal"}
        if confidence < threshold:
            return {"executed": False, "reason": "below_threshold"}
        if execution_price is None:
            return {"executed": False, "reason": "no_price_data"}

        if action == "BUY":
            return self._execute_buy(date, ticker, execution_price)
        if action == "SELL":
            return self._execute_sell(ticker, execution_price)
        return {"executed": False, "reason": "unknown_action"}

    def _execute_buy(self, date: str, ticker: str, price: float) -> dict:
        if self.cash < NOTIONAL:
            return {"executed": False, "skipped_reason": "insufficient_funds"}
        shares = NOTIONAL / price
        self.cash -= NOTIONAL
        if ticker in self.positions:
            existing = self.positions[ticker]
            total = existing.shares + shares
            avg = (existing.shares * existing.avg_cost + shares * price) / total
            self.positions[ticker] = Position(ticker, total, avg, existing.entry_date)
        else:
            self.positions[ticker] = Position(ticker, shares, price, date)
        return {"executed": True, "action": "BUY", "shares": shares, "price": price}

    def _execute_sell(self, ticker: str, price: float) -> dict:
        if ticker not in self.positions:
            return {"executed": False, "reason": "no_position"}
        pos = self.positions.pop(ticker)
        proceeds = pos.shares * price
        self.cash += proceeds
        pnl = (price - pos.avg_cost) * pos.shares
        return {"executed": True, "action": "SELL", "shares": pos.shares, "price": price, "pnl": pnl}

    def portfolio_value(self, current_prices: dict[str, float]) -> float:
        position_value = sum(
            pos.shares * current_prices.get(pos.ticker, pos.avg_cost)
            for pos in self.positions.values()
        )
        return self.cash + position_value

    def mark_to_market_positions(self, current_prices: dict[str, float]) -> list[dict]:
        """Close all open positions at given prices. Mutates cash."""
        results = []
        for ticker, pos in list(self.positions.items()):
            price = current_prices.get(ticker, pos.avg_cost)
            self.cash += pos.shares * price
            pnl = (price - pos.avg_cost) * pos.shares
            results.append({"ticker": ticker, "shares": pos.shares, "price": price, "pnl": pnl, "marked_to_market": True})
        self.positions.clear()
        return results
