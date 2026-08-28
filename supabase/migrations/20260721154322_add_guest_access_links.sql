create table if not exists public.guest_access_links (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  stay_id uuid references public.stays(id) on delete cascade,
  token_hash text not null unique,
  kind text not null check (kind in ('stay','property')),
  expires_at timestamptz,
  consumed_at timestamptz,
  max_redemptions integer not null default 1,
  redemption_count integer not null default 0,
  require_otp boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guest_access_links_property_idx on public.guest_access_links (property_id, created_at desc);
create index if not exists guest_access_links_stay_idx on public.guest_access_links (stay_id);
create unique index if not exists guest_access_links_token_hash_uidx on public.guest_access_links (token_hash);

alter table public.guest_access_links enable row level security;
-- No anon/authenticated policies: only the service role (server routes) reads/writes.
-- Guests redeem via a server endpoint; hosts mint/revoke via authenticated server routes
-- that use the service-role client after getPropertyAccess() authorization.
comment on table public.guest_access_links is 'Short-lived opaque magic-link / QR tokens that redeem into a guest_access_sessions row. token_hash = SHA-256 of the opaque token (never store raw). kind=stay (single-use-ish, host-vouched, may skip OTP) or property (reusable QR, rate-limited, require_otp). RLS on, service-role only.';
