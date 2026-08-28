create table notifications (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references host_accounts(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  recipient_profile_id uuid references profiles(id) on delete cascade,
  kind notification_kind not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(recipient_profile_id);
create index on notifications(host_account_id);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references host_accounts(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  stripe_price_id text,
  plan text,
  status subscription_status not null default 'incomplete',
  quantity int not null default 1,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(host_account_id)
);
create index on subscriptions(host_account_id);

-- Idempotent Stripe webhook event log
create table stripe_events (
  id text primary key, -- stripe event id
  type text not null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid references host_accounts(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  actor_profile_id uuid references profiles(id) on delete set null,
  actor_type text not null default 'host', -- host | guest | admin | system
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index on audit_logs(host_account_id);
create index on audit_logs(property_id);
create index on audit_logs(created_at);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  stay_id uuid references stays(id) on delete cascade,
  kind consent_kind not null,
  granted boolean not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index on consent_records(profile_id);
