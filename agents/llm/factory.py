"""
LLM provider factory.

Model selection is driven entirely by environment variables — no code changes
needed when upgrading to a new model generation.

To upgrade models, update these env vars:
  LLM_QUICK_MODEL=gemini-2.0-flash-lite   # fast, cheap — data retrieval, scanning
  LLM_DEEP_MODEL=gemini-2.0-flash-lite    # analysis, synthesis, final decisions

Known Gemini model IDs (update env vars as new generations release):
  gemini-2.0-flash-lite      cheapest, good for simple tasks
  gemini-2.0-flash           balanced speed/quality
  gemini-2.5-flash           next gen flash (when available)
  gemini-2.5-pro             deepest reasoning (when available)
"""

import os
import google.generativeai as genai

# Defaults — override with env vars, no code change needed
_DEFAULTS = {
    "quick": "gemini-2.0-flash-lite",
    "deep": "gemini-2.0-flash-lite",
}

_configured = False


def _ensure_configured() -> None:
    global _configured
    if not _configured:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY is not set")
        genai.configure(api_key=api_key)
        _configured = True


def get_model_id(mode: str = "quick") -> str:
    """Returns the model ID string for the given mode, without creating a client."""
    env_key = f"LLM_{mode.upper()}_MODEL"
    return os.environ.get(env_key, _DEFAULTS.get(mode, _DEFAULTS["quick"]))


def get_llm(mode: str = "quick") -> genai.GenerativeModel:
    """
    Returns a configured Gemini GenerativeModel.

    Args:
        mode: "quick" (fast/cheap) or "deep" (slower/better)

    To switch models: set LLM_QUICK_MODEL or LLM_DEEP_MODEL in your .env
    """
    _ensure_configured()
    model_id = get_model_id(mode)
    return genai.GenerativeModel(model_id)
