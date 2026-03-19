-- Migration: RBAC roles
-- Adds a role column to profiles for user/admin/superadmin access control.
-- Apply via Supabase dashboard — do NOT apply automatically.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
CHECK (role IN ('user', 'admin', 'superadmin'));
