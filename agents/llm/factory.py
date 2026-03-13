"""
LLM provider factory.

Model selection is driven entirely by environment variables — no code changes
needed when upgrading to a new model generation.

To upgrade models, update these env vars:
  LLM_QUICK_MODEL=gemini-2.0-flash   # fast — data retrieval, scanning, analysts
  LLM_DEEP_MODEL=gemini-2.0-flash    # synthesis, final decisions

Known Gemini model IDs (update env vars as new generations release):
  gemini-2.0-flash           balanced speed/quality (current default)
  gemini-2.5-flash           next gen flash
  gemini-2.5-pro             deepest reasoning
"""

import os
from google import genai
from google.genai import types

_DEFAULTS = {
    "quick": "gemini-2.5-flash",
    "deep": "gemini-2.5-flash",
}

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY is not set")
        _client = genai.Client(api_key=api_key)
    return _client


def get_model_id(mode: str = "quick") -> str:
    """Returns the model ID string for the given mode."""
    env_key = f"LLM_{mode.upper()}_MODEL"
    return os.environ.get(env_key, _DEFAULTS.get(mode, _DEFAULTS["quick"]))


def get_llm(mode: str = "quick"):
    """
    Returns (client, model_id) tuple for Gemini calls.

    Usage:
        client, model_id = get_llm("quick")
        response = client.models.generate_content(model=model_id, contents=prompt, ...)

    Args:
        mode: "quick" (fast/cheap) or "deep" (slower/better)
    """
    return _get_client(), get_model_id(mode)
