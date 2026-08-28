-- Early-access signups: pre-launch waitlist of prospective hosts.
-- Collected from the /welcome holding page (post-signup) and the landing
-- early-access path. This is marketing/onboarding data, not guest data.

create table if not exists public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Contact
  email text not null,
  name text,
  phone text,
  -- Intent
  desired_plan text,
  property_locations text,
  property_count text,
  features_wanted text[] not null default '{}',
  notes text,
  -- Provenance
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'welcome',
  constraint early_access_signups_email_lower check (email = lower(email))
);

create index if not exists early_access_signups_email_idx
  on public.early_access_signups (email);
create index if not exists early_access_signups_created_at_idx
  on public.early_access_signups (created_at desc);

alter table public.early_access_signups enable row level security;

comment on table public.early_access_signups is
  'Service-role only. RLS enabled with NO policies on purpose: deny-all for anon/authenticated. Pre-launch early-access signups + setup preferences collected on /welcome and the landing page.';
