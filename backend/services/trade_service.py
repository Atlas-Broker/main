# backend/services/trade_service.py
"""
Trade persistence and position sync.
record_trade()   — insert a row into supabase.trades
sync_positions() — upsert supabase.positions after a BUY or SELL
"""
import logging
from datetime import datetime, timezone
from db.supabase import get_supabase

logger = logging.getLogger(__name__)


def record_trade(
    *,
    user_id: str,
    portfolio_id: str,
    ticker: str,
    action: str,
    boundary_mode: str,
    signal_id: str,
    order: dict,
) -> None:
    sb = get_supabase()
    sb.table("trades").insert({
        "user_id": user_id,
        "portfolio_id": portfolio_id,
        "ticker": ticker,
        "action": action,
        "shares": float(order.get("qty") or 0),
        "price": float(order.get("filled_avg_price") or 0),
        "status": "filled",
        "boundary_mode": boundary_mode,
        "signal_id": signal_id,
        "order_id": order.get("order_id"),
        "executed_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def sync_positions(
    user_id: str,
    portfolio_id: str,
    ticker: str,
    action: str,
    order: dict,
) -> None:
    sb = get_supabase()
    qty = float(order.get("qty") or 0)
    fill_price = float(order.get("filled_avg_price") or 0)

    existing = (
        sb.table("positions")
        .select("*")
        .eq("portfolio_id", portfolio_id)
        .eq("ticker", ticker)
        .execute()
    )

    if action.upper() == "BUY":
        if existing.data:
            pos = existing.data[0]
            new_shares = pos["shares"] + qty
            new_avg = ((pos["shares"] * pos["avg_cost"]) + (qty * fill_price)) / new_shares
            sb.table("positions").update(
                {"shares": new_shares, "avg_cost": new_avg}
            ).eq("id", pos["id"]).execute()
        else:
            sb.table("positions").insert({
                "user_id": user_id,
                "portfolio_id": portfolio_id,
                "ticker": ticker,
                "shares": qty,
                "avg_cost": fill_price,
            }).execute()
    elif action.upper() == "SELL":
        if not existing.data:
            logger.warning(
                "sync_positions: no existing position for %s/%s — may have been closed externally. Skipping.",
                user_id, ticker,
            )
            return
        pos = existing.data[0]
        new_shares = pos["shares"] - qty
        if new_shares <= 0:
            sb.table("positions").update({
                "shares": 0,
                "closed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", pos["id"]).execute()
        else:
            sb.table("positions").update({"shares": new_shares}).eq("id", pos["id"]).execute()
