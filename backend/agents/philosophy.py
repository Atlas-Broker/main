"""
Philosophy Skills — overlay an investment philosophy lens on analyst prompts.

Each philosophy mode prepends a context block to each analyst's prompt so
the LLM reasons within that framework. v1 is prompt-level only — the
LangGraph graph structure does not change.

Modes:
  balanced  — Default. No overlay. Current behaviour unchanged.
  value     — Buffett-style. Intrinsic value, margin of safety, moat.
  momentum  — Trend-following. Price action, relative strength, breakouts.
  macro     — Top-down. Sector rotation, interest rates, macro environment.
"""
from __future__ import annotations

PHILOSOPHY_PROMPTS: dict[str, str] = {
    "value": (
        "Apply a value investing philosophy throughout your analysis. "
        "Prioritise intrinsic value, margin of safety, competitive moat, and "
        "long-term fundamentals. Be sceptical of short-term momentum and "
        "speculative narratives. Ask: what is this company worth, and is it "
        "trading at a discount to that intrinsic value?"
    ),
    "momentum": (
        "Apply a momentum investing philosophy throughout your analysis. "
        "Prioritise price trend, relative strength, volume confirmation, and "
        "breakout patterns. Fundamentals matter less than the direction and "
        "velocity of price action. Ask: is the trend your friend right now, "
        "and does the evidence support riding it further?"
    ),
    "macro": (
        "Apply a macro investing philosophy throughout your analysis. "
        "Prioritise the broader economic environment — interest rates, "
        "inflation regime, sector rotation dynamics, and macro tailwinds or "
        "headwinds affecting this asset class. Ask: does the macro context "
        "support or undermine this trade regardless of company-specific merits?"
    ),
    "balanced": "",  # No overlay — existing behaviour unchanged
}

VALID_PHILOSOPHY_MODES: frozenset[str] = frozenset(PHILOSOPHY_PROMPTS.keys())


def get_philosophy_prefix(philosophy_mode: str | None) -> str:
    """
    Return a formatted prefix string to prepend to an analyst prompt.

    Returns an empty string for balanced mode or None (both mean no overlay).
    Returns an empty string for any unrecognised mode (fail-safe).
    """
    mode = philosophy_mode or "balanced"
    prompt = PHILOSOPHY_PROMPTS.get(mode, "")
    if not prompt:
        return ""
    return f"[Investment Philosophy: {mode.title()}]\n{prompt}\n\n"
