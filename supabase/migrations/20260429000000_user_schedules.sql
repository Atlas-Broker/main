-- user_schedules: per-user pipeline scan window preferences.
-- Queried by the scheduler dispatcher (service role, cross-user fan-out)
-- and by the schedules API + MCP tools (user-scoped).
-- Note: "window" must be quoted — it is a reserved keyword in PostgreSQL.

CREATE TABLE IF NOT EXISTS public.user_schedules (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "window"   text        NOT NULL CHECK ("window" IN ('premarket', 'open', 'midmorning', 'midday', 'afternoon', 'close')),
  enabled    boolean     NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, "window")
);

ALTER TABLE public.user_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own schedules"
  ON public.user_schedules
  FOR ALL
  USING  (user_id = (auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Service role full access"
  ON public.user_schedules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
