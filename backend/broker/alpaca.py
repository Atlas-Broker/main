"""
AlpacaAdapter — paper trading implementation of BrokerAdapter.

Uses alpaca-py (alpaca.markets/sdks/python).
Reads ALPACA_API_KEY, ALPACA_SECRET_KEY from environment.
Set ALPACA_PAPER=true (default) for paper trading.
"""
import os

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce


class AlpacaAdapter:
    def __init__(self) -> None:
        api_key = os.environ["ALPACA_API_KEY"]
        secret_key = os.environ["ALPACA_SECRET_KEY"]
        paper = os.getenv("ALPACA_PAPER", "true").lower() == "true"
        self._client = TradingClient(api_key=api_key, secret_key=secret_key, paper=paper)

    def place_order(self, ticker: str, action: str, notional: float) -> dict:
        side = OrderSide.BUY if action.upper() == "BUY" else OrderSide.SELL
        req = MarketOrderRequest(
            symbol=ticker,
            notional=round(notional, 2),
            side=side,
            time_in_force=TimeInForce.DAY,
        )
        order = self._client.submit_order(req)
        return {
            "order_id": str(order.id),
            "status": str(order.status),
            "ticker": ticker,
            "action": action,
            "notional": notional,
        }

    def get_account(self) -> dict:
        acct = self._client.get_account()
        return {
            "equity": float(acct.equity),
            "cash": float(acct.cash),
            "buying_power": float(acct.buying_power),
            "portfolio_value": float(acct.portfolio_value),
        }

    def get_positions(self) -> list[dict]:
        positions = self._client.get_all_positions()
        return [
            {
                "ticker": p.symbol,
                "qty": float(p.qty),
                "avg_cost": float(p.avg_entry_price),
                "current_price": float(p.current_price),
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
            }
            for p in positions
        ]

    def cancel_order(self, order_id: str) -> bool:
        try:
            self._client.cancel_order_by_id(order_id)
            return True
        except Exception:
            return False
