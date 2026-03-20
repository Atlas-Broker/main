"""
Execution Boundary modes + per-mode configuration.

Advisory:    Signal generated. No execution. Human decides.
Conditional: Signal generated. Execution only after human approval.
Autonomous:  Signal executed immediately. Override window open after.
"""
from enum import Enum


class BoundaryMode(str, Enum):
    ADVISORY = "advisory"
    CONDITIONAL = "conditional"
    AUTONOMOUS = "autonomous"
    AUTONOMOUS_GUARDRAIL = "autonomous_guardrail"


# Per-mode configuration
MODE_CONFIG = {
    BoundaryMode.ADVISORY: {
        "min_confidence": 0.0,    # always surface signals
        "notional_usd": 0.0,      # no execution
        "override_window_s": 0,
    },
    BoundaryMode.CONDITIONAL: {
        "min_confidence": 0.60,   # only surface high-confidence signals for approval
        "notional_usd": 1000.0,   # dollar amount if approved
        "override_window_s": 0,   # no override — user already approved
    },
    BoundaryMode.AUTONOMOUS: {
        "min_confidence": 0.65,   # only auto-execute high-confidence signals
        "notional_usd": 1000.0,
        "override_window_s": 300,  # 5-minute override window after execution
    },
    BoundaryMode.AUTONOMOUS_GUARDRAIL: {
        "min_confidence": 0.65,    # auto-execute above; queue for review below
        "notional_usd": 1000.0,
        "override_window_s": 300,  # 5-min override same as autonomous
        "circuit_breaker_losses": 3,   # pause after N consecutive losses
        "circuit_breaker_drawdown": 0.15,  # pause if portfolio down 15%
    },
}
