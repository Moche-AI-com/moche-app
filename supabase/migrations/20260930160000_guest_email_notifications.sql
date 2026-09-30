-- Guest email notifications (PR 2b, #195). Additive only; phone/SMS columns untouched.
-- A guest may opt into email alerts for host replies / escalation answers. The
-- address is confirmed by a one-tap link before any alert is sent.
alter table public.guest_access_sessions
  add column if not exists notify_email text,
  add column if not exists notify_email_consent_at timestamptz,
  add column if not exists notify_email_verified_at timestamptz,
  add column if not exists notify_email_opted_out_at timestamptz;

create table if not exists public.guest_email_confirmations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.guest_access_sessions(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  email_hash text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists guest_email_confirmations_session_idx
  on public.guest_email_confirmations (session_id, created_at desc);

comment on table public.guest_email_confirmations is
  'One-tap guest email confirmation links (token stored hashed only). Server-role only.';

alter table public.guest_email_confirmations enable row level security;

-- No policies: every read/write goes through the service role. RLS enabled with
-- zero policies = deny-all for anon/authenticated (same as guest_push_subscriptions).
revoke all on public.guest_email_confirmations from anon, authenticated;
grant select, insert, update, delete on public.guest_email_confirmations to service_role;
