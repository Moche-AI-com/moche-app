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
  'Array of triggered safety-triage flags. Non-empty means the interview was bypassed and this escalated immediately.';
comment on column public.service_requests.likely_causes is
  'Array of unverified cause hypotheses surfaced by the AI interview. Always labeled unverified to the crew.';
comment on column public.service_requests.suggested_parts is
  'Array of plain-language part/tool suggestions for the crew, inferred from the interview. Unverified.';
comment on column public.service_requests.interview_transcript is
  'Full guest-facing Q&A transcript for this report.';
comment on column public.service_requests.interview_status is
  'in_progress: guest still answering. completed: report finalized normally. safety_escalated: a safety trigger bypassed the interview.';
