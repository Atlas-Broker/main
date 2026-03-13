"""
BrokerAdapter — the Protocol all broker implementations must satisfy.

Never call broker APIs directly. Always go through this interface.
New brokers (IBKR, Binance) are added by implementing this protocol.
"""
from typing import Protocol, runtime_checkable


@runtime_checkable
class BrokerAdapter(Protocol):
    def place_order(self, ticker: str, action: str, notional: float) -> dict:
        """
        Place a market order.

        Args:
            ticker:   e.g. "AAPL"
            action:   "BUY" or "SELL"
            notional: dollar amount to trade (e.g. 1000.0)

        Returns:
            dict with at minimum: {"order_id": str, "status": str}
        """
        ...

    def get_account(self) -> dict:
        """Returns account equity, cash, buying_power."""
        ...

    def get_positions(self) -> list[dict]:
        """Returns list of open positions."""
        ...

    def cancel_order(self, order_id: str) -> bool:
        """Cancels an open order. Returns True if successful."""
        ...
