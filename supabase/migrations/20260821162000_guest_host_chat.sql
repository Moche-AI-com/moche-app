begin;

-- Guest/host chat needs stable per-guest threads, escalation context, read state,
-- and announcement audit rows. Everything here is additive; existing portal tables
-- and RLS posture stay intact. New guest-facing tables are service-role mediated:
-- RLS is enabled and no anon/authenticated policies are created.

alter table public.conversations
  add column if not exists channel text not null default 'ai_concierge',
  add column if not exists guest_session_id uuid,
  add column if not exists guest_identity_id uuid,
  add column if not exists stay_guest_id uuid,
  add column if not exists last_message_at timestamptz,
  add column if not exists guest_read_at timestamptz,
  add column if not exists host_read_at timestamptz;

alter table public.conversations
  add constraint conversations_channel_check
  check (channel in ('ai_concierge', 'host_chat', 'announcement'));

alter table public.conversations
  add constraint conversations_guest_session_id_fkey
  foreign key (guest_session_id) references public.guest_access_sessions(id) on delete set null;

alter table public.conversations
  add constraint conversations_guest_identity_id_fkey
  foreign key (guest_identity_id) references public.guest_identities(id) on delete set null;

alter table public.messages
  add column if not exists message_kind text not null default 'text',
  add column if not exists reply_to_message_id uuid,
  add column if not exists escalation_id uuid;

alter table public.messages
  add constraint messages_message_kind_check
  check (message_kind in ('text', 'ai_escalation', 'announcement', 'system'));

alter table public.messages
  add constraint messages_reply_to_message_id_fkey
  foreign key (reply_to_message_id) references public.messages(id) on delete set null;

alter table public.messages
  add constraint messages_escalation_id_fkey
  foreign key (escalation_id) references public.escalations(id) on delete set null;

alter table public.escalations
  add column if not exists host_conversation_id uuid,
  add column if not exists guest_session_id uuid,
  add column if not exists guest_identity_id uuid,
  add column if not exists stay_guest_id uuid,
  add column if not exists pinned boolean not null default true,
  add column if not exists resolved_at timestamptz;

alter table public.escalations
  add constraint escalations_host_conversation_id_fkey
  foreign key (host_conversation_id) references public.conversations(id) on delete set null;

alter table public.escalations
  add constraint escalations_guest_session_id_fkey
  foreign key (guest_session_id) references public.guest_access_sessions(id) on delete set null;

alter table public.escalations
  add constraint escalations_guest_identity_id_fkey
  foreign key (guest_identity_id) references public.guest_identities(id) on delete set null;

alter table public.property_members
  add column if not exists can_send_announcements boolean not null default false,
  add column if not exists can_publish_guest_answers boolean not null default false;

create table if not exists public.stay_guests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  stay_id uuid not null references public.stays(id) on delete cascade,
  guest_identity_id uuid references public.guest_identities(id) on delete set null,
  guest_label text,
  display_name text,
  phone_hash text,
  phone_last4 text,
  pin_hash text not null,
  pin_expires_at timestamptz,
  pin_revoked_at timestamptz,
  pin_attempt_count integer not null default 0 check (pin_attempt_count >= 0),
  pin_first_used_at timestamptz,
  notification_consent boolean not null default false,
  notification_consent_at timestamptz,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stay_guests_stay_pin_hash_key
  on public.stay_guests (stay_id, pin_hash);
create index if not exists stay_guests_stay_active_idx
  on public.stay_guests (stay_id, pin_expires_at)
  where pin_revoked_at is null;
create index if not exists stay_guests_identity_idx
  on public.stay_guests (guest_identity_id);

alter table public.stay_guests enable row level security;

alter table public.conversations
  add constraint conversations_stay_guest_id_fkey
  foreign key (stay_guest_id) references public.stay_guests(id) on delete set null;

alter table public.escalations
  add constraint escalations_stay_guest_id_fkey
  foreign key (stay_guest_id) references public.stay_guests(id) on delete set null;

create table if not exists public.announcement_batches (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  stay_id uuid not null references public.stays(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.announcement_batches(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  guest_session_id uuid references public.guest_access_sessions(id) on delete set null,
  guest_identity_id uuid references public.guest_identities(id) on delete set null,
  stay_guest_id uuid references public.stay_guests(id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  created_at timestamptz not null default now(),
  unique (batch_id, conversation_id)
);

alter table public.announcement_batches enable row level security;
alter table public.announcement_recipients enable row level security;

create index if not exists conversations_host_inbox_idx
  on public.conversations (property_id, stay_id, channel, last_message_at desc nulls last);
create index if not exists conversations_guest_session_idx
  on public.conversations (guest_session_id, channel);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_escalation_idx
  on public.messages (escalation_id)
  where escalation_id is not null;
create index if not exists escalations_host_inbox_idx
  on public.escalations (property_id, stay_id, status, pinned, created_at desc);
create index if not exists announcement_batches_property_idx
  on public.announcement_batches (property_id, stay_id, created_at desc);

commit;
