-- Expand the allowed doc_slug values on atlas_docs_sections to include
-- INSTRUCTIONS (workflow guidance for Claude) and IDEAS (captured thoughts / backlog).

ALTER TABLE public.atlas_docs_sections
  DROP CONSTRAINT IF EXISTS atlas_docs_sections_doc_slug_check;

ALTER TABLE public.atlas_docs_sections
  ADD CONSTRAINT atlas_docs_sections_doc_slug_check
  CHECK (doc_slug IN ('CONTEXT', 'BUILD', 'INSTRUCTIONS', 'IDEAS'));
