-- Migration: add public profile fields to profiles table
-- website: user's personal/portfolio site URL
-- telegram_handle: Telegram username for notifications (e.g. "@whatelz")

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS telegram_handle TEXT;
