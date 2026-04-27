alter table public.docs_sections
  drop constraint if exists docs_sections_slug_check;

alter table public.docs_sections
  add constraint docs_sections_slug_check check (
    doc_slug in (
      'CONTEXT', 'BUILD', 'INSTRUCTIONS', 'IDEAS',
      'INTERIM_REPORT', 'FINAL_REPORT', 'BIWEEKLY_LOGS',
      'INBOX', 'PROPOSAL', 'LOGS', 'LEARNINGS', 'BRAND'
    )
  );
