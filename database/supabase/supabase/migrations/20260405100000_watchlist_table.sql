-- Create per-user watchlist table with per-ticker scan schedule
CREATE TABLE IF NOT EXISTS public.watchlist (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticker      text        NOT NULL,
  schedule    text        NOT NULL DEFAULT '3x'
                          CHECK (schedule IN ('1x', '3x', '6x')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, ticker)
);

-- RLS: each user can only see/modify their own rows
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own watchlist"
  ON public.watchlist
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Service-role bypass (backend uses service role)
CREATE POLICY "Service role full access"
  ON public.watchlist
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
