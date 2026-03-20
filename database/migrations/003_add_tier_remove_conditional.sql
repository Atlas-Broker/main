-- Migration 003: add tier column to profiles, remove conditional from boundary_mode
-- Applies to: public.profiles
-- Safe to re-run (idempotent guards on ADD COLUMN and DROP/ADD CONSTRAINT)

-- 1. Add tier column (free / pro / max) with a default of 'free'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'pro', 'max'));

-- 2. Migrate any existing rows that still carry the deprecated 'conditional' value
UPDATE public.profiles
  SET boundary_mode = 'advisory'
  WHERE boundary_mode = 'conditional';

-- 3. Drop the old boundary_mode check constraint (includes 'conditional')
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_boundary_mode_check;

-- 4. Re-add the constraint without 'conditional'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_boundary_mode_check
  CHECK (boundary_mode IN ('advisory', 'autonomous_guardrail', 'autonomous'));
