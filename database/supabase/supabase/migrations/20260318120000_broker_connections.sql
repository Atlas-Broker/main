-- Migration: broker_connections table
-- Stores per-user broker credentials and connection state.
--
-- Designed for minimal-friction upgrade to OAuth:
--   auth_method = 'api_key'  → api_key + api_secret columns used
--   auth_method = 'oauth'    → access_token + refresh_token + token_expires_at used
--
-- The UNIQUE(user_id, broker, environment) constraint means a user can have:
--   - One Alpaca paper connection AND one Alpaca live connection
--   - An Alpaca connection AND an IBKR connection (future)
-- all as separate rows.
--
-- RLS: users can manage their own connections via frontend (Clerk JWT).
-- Backend reads all active connections via service role key (bypasses RLS) for the scheduler.

CREATE TABLE public.broker_connections (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          text        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broker           text        NOT NULL DEFAULT 'alpaca'
                               CHECK (broker IN ('alpaca', 'ibkr')),
  auth_method      text        NOT NULL DEFAULT 'api_key'
                               CHECK (auth_method IN ('api_key', 'oauth')),

  -- API key auth (auth_method = 'api_key')
  api_key          text,
  api_secret       text,

  -- OAuth auth (auth_method = 'oauth') — for future Connect Alpaca / Connect IBKR
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,

  -- Config
  environment      text        NOT NULL DEFAULT 'paper'
                               CHECK (environment IN ('paper', 'live')),
  is_active        boolean     NOT NULL DEFAULT true,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, broker, environment)
);

ALTER TABLE public.broker_connections ENABLE ROW LEVEL SECURITY;

-- Users can manage their own connections via the frontend (Clerk JWT)
CREATE POLICY "Users can read own broker connections"
  ON public.broker_connections FOR SELECT
  USING ((auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "Users can insert own broker connections"
  ON public.broker_connections FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "Users can update own broker connections"
  ON public.broker_connections FOR UPDATE
  USING ((auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "Users can delete own broker connections"
  ON public.broker_connections FOR DELETE
  USING ((auth.jwt() ->> 'sub') = user_id);
