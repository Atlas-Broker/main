-- Add three report-oriented doc_slugs for school submissions:
--   INTERIM_REPORT  — migrated from docs/Interim_Report.md (submitted 12 April 2026)
--   FINAL_REPORT    — builds toward the 19 July 2026 final submission
--   BIWEEKLY_LOGS   — running log of progress for school biweekly check-ins

ALTER TABLE public.atlas_docs_sections
  DROP CONSTRAINT IF EXISTS atlas_docs_sections_doc_slug_check;

ALTER TABLE public.atlas_docs_sections
  ADD CONSTRAINT atlas_docs_sections_doc_slug_check
  CHECK (doc_slug IN (
    'CONTEXT',
    'BUILD',
    'INSTRUCTIONS',
    'IDEAS',
    'INTERIM_REPORT',
    'FINAL_REPORT',
    'BIWEEKLY_LOGS'
  ));
