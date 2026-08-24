begin;

-- Stays tab redesign (2026-08-24)
--
-- 1) stay_share_invites: delivery log for host-initiated guest portal shares
--    (SMS via Twilio / email via Resend). Destinations are stored as hash +
--    last4 only, matching the PII posture of stays/stay_guests. RLS enabled
--    with no anon/authenticated policies on purpose: hosts read share history
--    through the share API route (requirePropertyAccess + service role), never
--    directly from the browser — same posture as guest_access_links.
--
-- 2) One stay access code: stay_guests rows can now be identity-only records,
--    created when a guest self-identifies after entering the shared stay code.
--    pin_hash / pin_stay_hash become optional; rows with NULL PINs simply never
--    match the per-guest PIN verifier, so legacy per-guest PINs keep working
--    unchanged. The (stay_id, pin_hash) unique index is unaffected: Postgres
--    treats NULLs as distinct.

create table if not exists public.stay_share_invites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  stay_id uuid not null references public.stays(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  destination_hash text not null,
  destination_last4 text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stay_share_invites_stay_created_idx
  on public.stay_share_invites (stay_id, created_at desc);

alter table public.stay_share_invites enable row level security;

alter table public.stay_guests alter column pin_hash drop not null;
alter table public.stay_guests alter column pin_stay_hash drop not null;

comment on column public.stay_guests.pin_hash is
  'Legacy per-guest PIN (hash-only). NULL for identity-only rows created by guest self-identification under the one-stay-code model.';

commit;
