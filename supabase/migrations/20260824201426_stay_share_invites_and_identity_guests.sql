begin;

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
