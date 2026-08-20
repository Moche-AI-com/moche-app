-- GUEST-PORTAL-V2 — enhanced guest portal support
--
-- 1) Guest registration: first/last name on guest_identities; registration marker
--    + identity link on guest_access_sessions.
-- 2) No changes to conversations/messages/escalations: the Message Host Directly
--    workflow stores its thread on escalations rows with conversation_id IS NULL,
--    which keeps host threads out of the AI concierge conversation entirely.
--
-- Reversible: columns are additive and nullable (or have safe defaults).

alter table public.guest_identities
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column public.guest_identities.first_name is 'Guest registration (portal v2). Plaintext name; phone stays hash+last4 only.';
comment on column public.guest_identities.last_name is 'Guest registration (portal v2). Plaintext name; phone stays hash+last4 only.';

alter table public.guest_access_sessions
  add column if not exists registered_at timestamptz,
  add column if not exists guest_identity_id uuid references public.guest_identities(id) on delete set null;

comment on column public.guest_access_sessions.registered_at is 'Set when the guest completes portal registration (name + phone). Null = code verified but not yet registered.';
comment on column public.guest_access_sessions.guest_identity_id is 'The guest profile this session registered as.';

create index if not exists guest_access_sessions_guest_identity_idx
  on public.guest_access_sessions (guest_identity_id);
