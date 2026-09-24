-- Record the published Terms version for the file-based registry and audit history.
-- Runtime re-acceptance compares lib/legal/registry.ts to legal_acceptances.
insert into public.legal_documents (slug, version, effective_date)
values ('terms', 'v1.3.0', date '2026-09-24')
on conflict (slug, version) do nothing;
