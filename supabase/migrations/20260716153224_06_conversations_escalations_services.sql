create table conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  stay_id uuid not null references stays(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on conversations(property_id);
create index on conversations(stay_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  role conversation_role not null,
  content text not null,
  intent intent_type,
  sources jsonb,          -- [{brain_item_id, title, category, score}]
  model text,
  confidence numeric,
  latency_ms int,
  author_profile_id uuid references profiles(id) on delete set null, -- for host replies
  created_at timestamptz not null default now()
);
create index on messages(conversation_id);
create index on messages(property_id);

create table message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  value feedback_value not null,
  created_at timestamptz not null default now(),
  unique(message_id)
);

create table escalations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  stay_id uuid references stays(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  question text not null,
  status escalation_status not null default 'open',
  host_response text,
  responded_by uuid references profiles(id) on delete set null,
  responded_at timestamptz,
  converted_brain_item_id uuid references brain_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on escalations(property_id);
create index on escalations(status);

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  stay_id uuid references stays(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  service_type service_type not null default 'maintenance',
  urgency urgency_level not null default 'medium',
  description text not null,
  status service_status not null default 'new',
  assigned_contact_id uuid references property_contacts(id) on delete set null,
  resolution_notes text,
  timeline jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on service_requests(property_id);
create index on service_requests(status);
create index on service_requests(urgency);
