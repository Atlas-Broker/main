-- Atlas docs as database-backed sections, exposed via MCP to Claude Chat + Claude Code.
-- Source of truth for CONTEXT and BUILD docs. Replaces /docs/*.md for those two files.

CREATE TABLE IF NOT EXISTS public.atlas_docs_sections (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_slug    text        NOT NULL CHECK (doc_slug IN ('CONTEXT', 'BUILD')),
  heading     text        NOT NULL,
  content     text        NOT NULL DEFAULT '',
  position    integer     NOT NULL,
  version     integer     NOT NULL DEFAULT 1,
  is_current  boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  CONSTRAINT atlas_docs_sections_unique_heading
    UNIQUE (doc_slug, heading) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_atlas_docs_sections_slug_position
  ON public.atlas_docs_sections (doc_slug, position)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_atlas_docs_sections_updated_at
  ON public.atlas_docs_sections (updated_at DESC)
  WHERE is_current = true;

CREATE TABLE IF NOT EXISTS public.atlas_docs_section_versions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id  uuid        NOT NULL REFERENCES public.atlas_docs_sections(id) ON DELETE CASCADE,
  doc_slug    text        NOT NULL,
  heading     text        NOT NULL,
  content     text        NOT NULL,
  version     integer     NOT NULL,
  updated_at  timestamptz NOT NULL,
  updated_by  text,
  operation   text        NOT NULL
                          CHECK (operation IN ('create', 'patch', 'append', 'delete', 'move', 'rename'))
);

CREATE INDEX IF NOT EXISTS idx_atlas_docs_section_versions_section
  ON public.atlas_docs_section_versions (section_id, version DESC);

-- RLS: writes go through service role only (MCP server uses SUPABASE_SERVICE_KEY).
-- Keep RLS on with no user policies so anon/authenticated tokens cannot touch these rows.
ALTER TABLE public.atlas_docs_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_docs_section_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on atlas_docs_sections"
  ON public.atlas_docs_sections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on atlas_docs_section_versions"
  ON public.atlas_docs_section_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
