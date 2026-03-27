"""
Pipeline service — orchestrates the agent pipeline + EBC.

Called by the pipeline route. Keeps the route thin.
"""
import asyncio
import logging
from datetime import datetime, timezone

from boundary.controller import EBC
from boundary.modes import BoundaryMode

logger = logging.getLogger(__name__)


def run_pipeline_with_ebc(
    ticker: str,
    boundary_mode: str,
    user_id: str = "system",
    as_of_date: str | None = None,
    philosophy_mode: str | None = None,
) -> dict:
    """
    Run the full agent pipeline for a ticker and apply the EBC.

    Returns a dict ready to be serialised as JSON from the API.
    """
    # Validate mode early — fail fast with a clear message
    try:
        bmode = BoundaryMode(boundary_mode)
    except ValueError:
        valid = [m.value for m in BoundaryMode]
        raise ValueError(f"Invalid boundary_mode '{boundary_mode}'. Must be one of: {valid}")

    from agents.orchestrator import run_pipeline

    signal = run_pipeline(
        ticker=ticker.upper(),
        boundary_mode=boundary_mode,
        user_id=user_id,
        as_of_date=as_of_date,
        philosophy_mode=philosophy_mode,
    )
    logger.info(
        "Pipeline complete: %s %s %.0f%% confidence",
        signal.action, ticker, signal.confidence * 100,
    )

    # Initialise broker for any autonomous mode (full or guardrail) — avoids unnecessary DB calls in advisory
    broker = None
    if bmode in (BoundaryMode.AUTONOMOUS, BoundaryMode.AUTONOMOUS_GUARDRAIL):
        try:
            from broker.factory import get_broker_for_user
            broker = get_broker_for_user(user_id)
            if broker is None:
                logger.warning(
                    "Autonomous mode (%s) requested for user %s but no broker connection found. "
                    "Signal will be skipped.",
                    boundary_mode,
                    user_id,
                )
        except Exception as exc:
            logger.warning("Could not initialise broker for autonomous mode (%s): %s", boundary_mode, exc)

    ebc = EBC(broker=broker)
    result = ebc.execute(signal, mode=boundary_mode)

    # Fire-and-forget guardrail notification when a signal is held for human review
    if result.guardrail_triggered:
        from services.notification_service import send_guardrail_notification  # noqa: PLC0415
        try:
            asyncio.get_event_loop().create_task(
                send_guardrail_notification(
                    user_id=user_id,
                    ticker=signal.ticker,
                    action=signal.action,
                    confidence=signal.confidence,
                    reasoning=signal.reasoning,
                )
            )
        except RuntimeError:
            pass  # no running event loop in synchronous test context

    return {
        "signal": {
            "id": signal.trace_id,
            "ticker": signal.ticker,
            "action": signal.action,
            "confidence": signal.confidence,
            "reasoning": signal.reasoning,
            "boundary_mode": boundary_mode,
            "risk": signal.risk,
            "trace_id": signal.trace_id,
            "latency_ms": signal.latency_ms,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        "execution": {
            "status": result.status,
            "executed": result.executed,
            "mode": result.mode,
            "message": result.message,
            "order_id": result.order_id,
            "override_window_s": result.override_window_s,
        },
    }
