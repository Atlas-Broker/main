"""
get_broker() returns the appropriate BrokerAdapter based on environment.

BROKER env var selects the implementation:
  "alpaca"  (default) — Alpaca paper/live trading
  "ibkr"              — Interactive Brokers (Phase 4, not yet implemented)
"""
import os

from broker.base import BrokerAdapter


def get_broker() -> BrokerAdapter:
    broker = os.getenv("BROKER", "alpaca").lower()
    if broker == "alpaca":
        from broker.alpaca import AlpacaAdapter
        return AlpacaAdapter()
    raise ValueError(f"Unknown broker: {broker!r}. Set BROKER env var to 'alpaca'.")
