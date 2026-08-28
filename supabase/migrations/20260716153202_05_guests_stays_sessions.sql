-- Guest identities: hashed contact for privacy
create table guest_identities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  display_name text,
  contact_hash text not null, -- sha256 of normalized phone/email + salt
  contact_type text not null default 'phone', -- phone | email
  contact_last4 text, -- last 4 for host display only
  created_at timestamptz not null default now()
);
create index on guest_identities(property_id);
create index on guest_identities(contact_hash);

-- Stays
create table stays (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  guest_identity_id uuid references guest_identities(id) on delete set null,
  guest_display_name text not null,
  contact_hash text not null,
  contact_type text not null default 'phone',
  contact_last4 text,
  check_in timestamptz not null,
  check_out timestamptz not null,
  guest_count int not null default 1,
  booking_reference text,
  host_notes text, -- host-only
  status stay_status not null default 'upcoming',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on stays(property_id);
create index on stays(contact_hash);
create index on stays(status);

-- Guest access sessions (stay-scoped, opaque token hash)
create table guest_access_sessions (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  session_token_hash text not null unique, -- sha256 of opaque session token
  status access_status not null default 'pending',
  verified_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index on guest_access_sessions(stay_id);
create index on guest_access_sessions(property_id);

-- OTP / magic-link verification records (expiring, single-use)
create table guest_verifications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  stay_id uuid references stays(id) on delete cascade,
  contact_hash text not null,
  code_hash text not null, -- hashed OTP
  attempts int not null default 0,
  max_attempts int not null default 5,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on guest_verifications(property_id, contact_hash);
create index on guest_verifications(expires_at);
