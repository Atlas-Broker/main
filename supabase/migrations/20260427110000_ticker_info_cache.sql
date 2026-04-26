CREATE TABLE IF NOT EXISTS ticker_info_cache (
  ticker      TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Service-role only. No RLS — not user-scoped data.
