"""
Broker factory — returns the appropriate BrokerAdapter.

Two entry points:
  get_broker()              — uses env var credentials (backward compat, single-user)
  get_broker_for_user(uid)  — uses per-user credentials from Supabase (multi-user)

BROKER env var selects the implementation:
  "alpaca"  (default) — Alpaca paper/live trading
  "ibkr"              — Interactive Brokers (future)
"""
import os

from broker.base import BrokerAdapter


def get_broker() -> BrokerAdapter:
    """Return a broker using env var credentials. Falls back for single-user setups."""
    broker = os.getenv("BROKER", "alpaca").lower()
    if broker == "alpaca":
        from broker.alpaca import AlpacaAdapter
        return AlpacaAdapter()
    raise ValueError(f"Unknown broker: {broker!r}. Set BROKER env var to 'alpaca'.")


def get_broker_for_user(user_id: str, environment: str = "paper") -> BrokerAdapter | None:
    """
    Return a broker configured with the user's stored credentials.
    Returns None if the user has no active broker connection.

    When OAuth is added (auth_method='oauth'), this function routes to an
    OAuth-aware adapter using access_token instead of api_key/api_secret.
    """
    from services.broker_service import get_connection

    conn = get_connection(user_id, environment=environment)
    if not conn:
        return None

    broker_name = conn["broker"]
    auth_method = conn["auth_method"]

    if broker_name == "alpaca":
        from broker.alpaca import AlpacaAdapter

        if auth_method == "api_key":
            return AlpacaAdapter(
                api_key=conn["api_key"],
                secret_key=conn["api_secret"],
                paper=(environment == "paper"),
            )
        # Future: auth_method == 'oauth'
        # return AlpacaOAuthAdapter(access_token=conn["access_token"])
        raise ValueError(f"Unsupported auth_method for alpaca: {auth_method!r}")

    raise ValueError(f"Unknown broker: {broker_name!r}")
