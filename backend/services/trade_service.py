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


def cancel_and_log(trade_id: str, user_id: str, reason: str | None) -> dict:
    """
    Cancel a trade within the 5-minute override window.
    Steps:
      1. Look up trade — 404 if not found or not owned by user.
      2. Idempotency: return 200 immediately if already overridden.
      3. Window check: raise 409 if elapsed > 300 s.
      4. Attempt broker cancellation (log exception, never propagate).
      5. Write override_log audit record (always, even on broker failure).
      6. Update trade status to "overridden" (with user_id guard).
      7. Return {"success": bool, "message": str}.
    """
    from fastapi import HTTPException
    from broker.factory import get_broker

    sb = get_supabase()

    # 1. Trade lookup with ownership check
    result = (
        sb.table("trades")
        .select("*")
        .eq("id", trade_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Trade not found")
    trade = result.data

    # 2. Idempotency
    if trade["status"] == "overridden":
        return {"success": True, "message": "Trade already overridden"}

    # 3. Override window check — handle UTC-naive executed_at defensively
    executed_at = datetime.fromisoformat(trade["executed_at"])
    if executed_at.tzinfo is None:
        executed_at = executed_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - executed_at).total_seconds()
    if elapsed > 300:
        raise HTTPException(
            status_code=409,
            detail="Override window has closed (5 min limit)",
        )

    # 4. Attempt broker cancellation
    broker_cancel_success = False
    try:
        broker = get_broker()
        broker_cancel_success = broker.cancel_order(trade["order_id"])
    except Exception as exc:
        logger.error("Broker cancel_order raised exception: %s", exc)

    # 5. Write audit log — always, even on broker failure; non-blocking
    try:
        sb.table("override_log").insert({
            "user_id": user_id,
            "trade_id": trade_id,
            "order_id": trade["order_id"],
            "ticker": trade["ticker"],
            "reason": reason or "user_initiated",
            "broker_cancel_success": broker_cancel_success,
            "overridden_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.error("override_log write failed: %s", exc)

    # 6. Update trade status — dual-key guard prevents TOCTOU race
    sb.table("trades").update({"status": "overridden"}).eq("id", trade_id).eq(
        "user_id", user_id
    ).execute()

    # 7. Return result
    if broker_cancel_success:
        return {"success": True, "message": "Order cancelled successfully"}
    return {
        "success": False,
        "message": (
            "Override logged but broker could not cancel the order — "
            "it may have already been filled"
        ),
    }
