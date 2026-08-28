-- PROFILES: 1:1 with auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  phone text,
  is_admin boolean not null default false,
  mfa_ready boolean not null default false,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- HOST ACCOUNTS (organizations / tenant root)
create table host_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete restrict,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on host_accounts(owner_id);

-- ORGANIZATION MEMBERS (account-level membership)
create table organization_members (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references host_accounts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role user_role not null default 'co_host',
  invited_email text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(host_account_id, profile_id)
);
create index on organization_members(profile_id);
create index on organization_members(host_account_id);
