-- Personal Access Tokens for Atlas API MCP (sprint 017).
-- Raw token shown once; SHA-256 hash stored for O(1) lookup.

CREATE TABLE IF NOT EXISTS public.user_pats (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  token_hash   text        NOT NULL UNIQUE,
  scope        text        NOT NULL CHECK (scope IN ('read', 'write', 'read_write')),
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_pats_token_hash ON public.user_pats (token_hash);
CREATE INDEX IF NOT EXISTS idx_user_pats_user_id    ON public.user_pats (user_id);

ALTER TABLE public.user_pats ENABLE ROW LEVEL SECURITY;

-- Users can only read and delete their own PATs; no update (rotate = delete + create)
CREATE POLICY "user_pats_select_own"
  ON public.user_pats FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "user_pats_delete_own"
  ON public.user_pats FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);
