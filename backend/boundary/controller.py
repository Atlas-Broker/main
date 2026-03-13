"""
Execution Boundary Controller (EBC) — Atlas's core differentiator.

Takes an AgentSignal and a configured mode, routes to the correct
execution path, and returns an ExecutionResult.

Advisory:    No execution. Returns signal for display.
Conditional: Returns awaiting_approval. Execution only on user approval.
Autonomous:  Places order via broker immediately. Override window open.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from boundary.modes import BoundaryMode, MODE_CONFIG

if TYPE_CHECKING:
    from broker.base import BrokerAdapter


@dataclass
class ExecutionResult:
    mode: str
    executed: bool
    status: str          # "advisory" | "awaiting_approval" | "filled" | "skipped"
    signal_id: str
    ticker: str
    action: str
    confidence: float
    reasoning: str
    risk: dict
    order_id: str | None = None
    override_window_s: int = 0
    message: str = ""
    extra: dict = field(default_factory=dict)


class EBC:
    """
    Execution Boundary Controller.

    Usage:
        ebc = EBC(broker=get_broker())
        result = ebc.execute(signal, mode="autonomous")
    """

    def __init__(self, broker: BrokerAdapter | None = None) -> None:
        self._broker = broker

    def execute(self, signal, mode: str) -> ExecutionResult:
        """
        Route signal to the correct execution path.

        Args:
            signal: AgentSignal from orchestrator
            mode:   "advisory" | "conditional" | "autonomous"
        """
        bmode = BoundaryMode(mode)
        config = MODE_CONFIG[bmode]

        base = {
            "mode": mode,
            "signal_id": signal.trace_id,
            "ticker": signal.ticker,
            "action": signal.action,
            "confidence": signal.confidence,
            "reasoning": signal.reasoning,
            "risk": signal.risk,
        }

        if bmode == BoundaryMode.ADVISORY:
            return ExecutionResult(
                **base,
                executed=False,
                status="advisory",
                message="Signal generated. No execution in advisory mode.",
            )

        if signal.confidence < config["min_confidence"]:
            return ExecutionResult(
                **base,
                executed=False,
                status="skipped",
                message=(
                    f"Confidence {signal.confidence:.0%} below threshold "
                    f"{config['min_confidence']:.0%} for {mode} mode."
                ),
            )

        if bmode == BoundaryMode.CONDITIONAL:
            return ExecutionResult(
                **base,
                executed=False,
                status="awaiting_approval",
                message="Signal pending user approval. POST /v1/signals/{id}/approve to execute.",
            )

        # Autonomous — execute immediately
        if self._broker is None:
            return ExecutionResult(
                **base,
                executed=False,
                status="skipped",
                message="Autonomous mode requested but no broker configured.",
            )

        # HOLD signals don't place an order
        if signal.action == "HOLD":
            return ExecutionResult(
                **base,
                executed=False,
                status="skipped",
                message="HOLD signal — no order placed.",
            )

        notional = config["notional_usd"]
        order = self._broker.place_order(signal.ticker, signal.action, notional)

        return ExecutionResult(
            **base,
            executed=True,
            status="filled",
            order_id=order["order_id"],
            override_window_s=config["override_window_s"],
            message=f"Order placed: {signal.action} ${notional:.0f} of {signal.ticker}.",
            extra={"order": order},
        )
