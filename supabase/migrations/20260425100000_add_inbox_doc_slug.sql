-- Add INBOX as a valid doc_slug for external-agent coordination channel (sprint 022)
alter table public.atlas_docs_sections
  drop constraint if exists atlas_docs_sections_doc_slug_check;

alter table public.atlas_docs_sections
  add constraint atlas_docs_sections_doc_slug_check
  check (doc_slug in (
    'CONTEXT', 'BUILD', 'INSTRUCTIONS', 'IDEAS',
    'INTERIM_REPORT', 'FINAL_REPORT', 'BIWEEKLY_LOGS',
    'INBOX'
  ));

alter table public.atlas_docs_section_versions
  drop constraint if exists atlas_docs_section_versions_doc_slug_check;

alter table public.atlas_docs_section_versions
  add constraint atlas_docs_section_versions_doc_slug_check
  check (doc_slug in (
    'CONTEXT', 'BUILD', 'INSTRUCTIONS', 'IDEAS',
    'INTERIM_REPORT', 'FINAL_REPORT', 'BIWEEKLY_LOGS',
    'INBOX'
  ));
