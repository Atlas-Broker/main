"""
Philosophy Skills — overlay an investment philosophy lens on analyst prompts.

Each philosophy mode prepends a context block to each analyst's prompt so
the LLM reasons within that framework. v1 is prompt-level only — the
LangGraph graph structure does not change.

Modes:
  balanced  — Default. No overlay. Current behaviour unchanged.
  buffett   — Warren Buffett: intrinsic value, margin of safety, moat, long-term.
  soros     — George Soros: macro reflexivity, sentiment shifts, contrarian at inflections.
  lynch     — Peter Lynch: GARP (Growth At Reasonable Price), consumer-lens, identify trends early.
"""
from __future__ import annotations

PHILOSOPHY_PROMPTS: dict[str, str] = {
    "buffett": (
        "Apply Warren Buffett's value investing philosophy throughout your analysis. "
        "Prioritise intrinsic value: estimate what this business is worth to a rational "
        "long-term owner, then demand a meaningful margin of safety before recommending "
        "entry. Evaluate the durability of the competitive moat — pricing power, "
        "switching costs, network effects, cost advantages — and ask whether it is "
        "widening or narrowing. Weight long-term fundamentals (owner earnings, return on "
        "equity, capital allocation track record) far above short-term price movements. "
        "Be sceptical of speculative narratives, complex financial engineering, and "
        "businesses you cannot confidently project a decade forward. Ask: what is this "
        "company truly worth, is it trading at a meaningful discount to that value, and "
        "would I be comfortable owning it if the market closed for ten years?"
    ),
    "soros": (
        "Apply George Soros's macro reflexivity philosophy throughout your analysis. "
        "Recognise that market prices are not merely passive reflections of fundamentals — "
        "they actively shape the fundamentals through feedback loops between participant "
        "beliefs and underlying reality. Identify the prevailing narrative or bias driving "
        "current sentiment and evaluate whether that bias is in an early, mid, or late "
        "stage of self-reinforcement. Look for inflection points where the prevailing "
        "trend becomes unsustainable and consensus expectations are most vulnerable to "
        "reversal. Weight macro forces — credit cycles, currency dynamics, geopolitical "
        "regime shifts, central bank posture — above individual company merits when they "
        "are dominant. Be willing to take a contrarian stance when reflexive processes "
        "have pushed price far from any plausible fundamental anchor. Ask: what is the "
        "dominant bias in this market right now, how far has the reflexive loop run, "
        "and where is the point of maximum dislocation?"
    ),
    "lynch": (
        "Apply Peter Lynch's GARP (Growth At Reasonable Price) philosophy throughout "
        "your analysis. Seek companies that combine genuine earnings growth with a "
        "valuation that has not yet fully priced in that growth — use PEG ratio as a "
        "primary lens (PEG below 1.0 is attractive, above 2.0 warrants caution). "
        "Leverage a consumer and ground-level perspective: notice products and services "
        "gaining real-world traction before Wall Street consensus catches up. Categorise "
        "the business (slow grower, stalwart, fast grower, cyclical, turnaround, asset "
        "play) and apply the appropriate valuation framework and holding period. Favour "
        "simple, understandable businesses with a clear story you can explain in two "
        "minutes. Be alert to early signs that a fast grower is saturating its market or "
        "losing execution focus. Ask: is this company growing earnings faster than the "
        "market appreciates, is the price reasonable relative to that growth, and can I "
        "identify the consumer or industry trend that will carry it forward?"
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
