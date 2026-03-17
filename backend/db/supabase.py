"""
Supabase service-key client singleton.
Uses the service key — RLS is bypassed.
Every query on user data MUST include .eq("user_id", user_id).
"""
import os
from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return the singleton Supabase client, creating it on first call."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client
