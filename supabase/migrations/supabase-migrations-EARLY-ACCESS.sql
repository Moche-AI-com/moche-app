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
  desired_plan text,           -- e.g. 'essentials' | 'pro' | 'portfolio' | 'enterprise' | 'not_sure'
  property_locations text,     -- free text: where their properties are
  property_count text,         -- free text / range label, e.g. '1', '2-5', '6-10', '10+'
  features_wanted text[] not null default '{}',  -- chip selections
  notes text,
  -- Provenance
  user_id uuid references auth.users(id) on delete set null,  -- set when signed up
  source text not null default 'welcome',                     -- 'welcome' | 'landing'
  constraint early_access_signups_email_lower check (email = lower(email))
);

-- Normalize email for case-insensitive dedupe reads by the service role.
create index if not exists early_access_signups_email_idx
  on public.early_access_signups (email);
create index if not exists early_access_signups_created_at_idx
  on public.early_access_signups (created_at desc);

-- Fail-closed: RLS on, deliberately NO policies. This mirrors app_settings and
-- host_otp_challenges in supabase-migrations-P0-SECURITY.sql section 5 — deny-all
-- for anon/authenticated; only the service role (server routes) reads/writes.
alter table public.early_access_signups enable row level security;

comment on table public.early_access_signups is
  'Service-role only. RLS enabled with NO policies on purpose: deny-all for anon/authenticated. Pre-launch early-access signups + setup preferences collected on /welcome and the landing page.';
