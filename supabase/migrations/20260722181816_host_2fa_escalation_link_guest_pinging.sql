alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists sms_opt_in boolean not null default false;
alter table public.profiles add column if not exists sms_opt_in_at timestamptz;
alter table public.profiles add column if not exists two_factor_enabled boolean not null default false;

create table if not exists public.host_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'login',
  code_hash text not null,
  phone_last4 text,
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists host_otp_challenges_user_purpose_idx
  on public.host_otp_challenges (user_id, purpose, created_at desc);

alter table public.host_otp_challenges enable row level security;

alter table public.guest_access_sessions add column if not exists guest_contact text;
alter table public.guest_access_sessions add column if not exists guest_contact_type text;
alter table public.guest_access_sessions add column if not exists notification_consent boolean not null default false;
alter table public.guest_access_sessions add column if not exists notification_consent_at timestamptz;
