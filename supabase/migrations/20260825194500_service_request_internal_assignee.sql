begin;

-- Internal assignee for service requests (2026-08-25)
--
-- assigned_profile_id points at a teammate (the account owner or a property
-- member) responsible for the request. It is deliberately separate from
-- assigned_contact_id, which is an external property contact (cleaner,
-- plumber…) whose phone/email fills the follow-up line on outbound
-- Email/Text report shares. Nullable, SET NULL on profile deletion, and the
-- assign API route validates that the profile is the account owner or a
-- member of the ticket's property before writing.

alter table public.service_requests
  add column if not exists assigned_profile_id uuid references public.profiles(id) on delete set null;

comment on column public.service_requests.assigned_profile_id is
  'Internal teammate (account owner or property member) assigned to the request. Distinct from assigned_contact_id (external contact used on outbound share messages).';

commit;
