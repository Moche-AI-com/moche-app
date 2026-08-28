create table properties (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references host_accounts(id) on delete cascade,
  display_name text not null,
  slug text not null unique,
  status property_status not null default 'draft',
  timezone text not null default 'America/New_York',
  locale text not null default 'en',
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  cover_image_url text,
  logo_url text,
  brand_primary text default '#33E6D4',
  brand_accent text default '#FF8A5C',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on properties(host_account_id);
create index on properties(status);

-- Per-property member permissions (co-host scoping)
create table property_members (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'co_host',
  can_receive_escalations boolean not null default true,
  can_reply_guests boolean not null default true,
  can_resolve_maintenance boolean not null default true,
  can_edit_brain boolean not null default false,
  can_view_analytics boolean not null default true,
  created_at timestamptz not null default now(),
  unique(property_id, profile_id)
);
create index on property_members(profile_id);
create index on property_members(property_id);

-- Property settings (concierge behavior + modules)
create table property_settings (
  property_id uuid primary key references properties(id) on delete cascade,
  concierge_tone text not null default 'warm_professional',
  ai_temperature numeric not null default 0.2,
  confidence_threshold numeric not null default 0.55,
  grace_period_hours int not null default 12,
  modules jsonb not null default '{"wifi":true,"checkin":true,"checkout":true,"parking":true,"appliances":true,"house_rules":true,"local":true,"maintenance":true,"cleaning":true,"emergency":true}'::jsonb,
  review_nudge_enabled boolean not null default false,
  review_nudge_auto boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Property contacts (escalation / emergency)
create table property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  label text not null,
  contact_type text not null default 'host',
  name text,
  phone text,
  email text,
  is_emergency boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index on property_contacts(property_id);
