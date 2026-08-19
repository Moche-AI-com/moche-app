-- WS-7: service request flow with AI triage.
-- Extends service_requests (not a new table) with the structured-report fields
-- the adaptive guest interview produces, plus an interview transcript so the
-- guest-facing Q&A can resume across requests without a separate table.

alter table public.service_requests
  add column if not exists safety_flags jsonb not null default '[]'::jsonb,
  add column if not exists location_note text,
  add column if not exists likely_causes jsonb not null default '[]'::jsonb,
  add column if not exists suggested_parts jsonb not null default '[]'::jsonb,
  add column if not exists access_instructions text,
  add column if not exists guest_availability text,
  add column if not exists media_urls jsonb not null default '[]'::jsonb,
  add column if not exists summary text,
  add column if not exists interview_transcript jsonb not null default '[]'::jsonb,
  add column if not exists interview_status text not null default 'in_progress';

alter table public.service_requests
  add constraint service_requests_interview_status_check
  check (interview_status in ('in_progress', 'completed', 'safety_escalated'));

comment on column public.service_requests.safety_flags is
  'Array of triggered safety-triage flags (e.g. "gas_smell", "active_flooding"). Non-empty means the interview was bypassed and this escalated immediately.';
comment on column public.service_requests.likely_causes is
  'Array of unverified cause hypotheses surfaced by the AI interview. Always labeled unverified to the crew -- never presented as a diagnosis.';
comment on column public.service_requests.suggested_parts is
  'Array of plain-language part/tool suggestions for the crew, inferred from the interview. Unverified.';
comment on column public.service_requests.interview_transcript is
  'Full guest-facing Q&A transcript for this report. Guest-authored content only -- never used to store internal host notes.';
comment on column public.service_requests.interview_status is
  'in_progress: guest is still answering questions. completed: structured report finalized normally. safety_escalated: a safety trigger bypassed the interview.';

-- RLS: service_requests already has host-scoped SELECT/UPDATE policies from
-- migration 06_conversations_escalations_services; new columns are covered
-- automatically since Postgres RLS is row-, not column-scoped, and no new
-- exposure path (anon has no policy on this table -- guest reads go through
-- the API route using the service-role admin client, same as every other
-- guest-facing endpoint in this codebase).
