-- Notification preferences + dedicated host_message kind
-- ------------------------------------------------------
-- 1. 'host_message' joins notification_kind so guest-to-host chat messages are
--    their own always-on path instead of overloading 'system' (which also
--    carries sign-in / visit-code lockout alerts). ALTER TYPE ... ADD VALUE
--    commits with this migration; application code references the new value
--    only after it has run (deploy order: migration first, then app).
-- 2. public.notification_preferences stores one row per (member, category):
--    enabled = false means unsubscribed. A MISSING row means subscribed
--    (default on), so new members and newly added categories never silently
--    stop notifying. Rows are never deleted -- preferences flip `enabled`.
--
-- RLS (per AGENTS.md hard boundary 8): members can read, create, and update
-- ONLY their own preference rows, and only inside a host account they belong
-- to. No DELETE policy exists at all, and the guest portal never touches this
-- table.

alter type public.notification_kind add value if not exists 'host_message';

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references public.host_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category ~ '^[a-z][a-z0-9_]*$' and length(category) <= 40),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, category)
);

create index if not exists notification_preferences_account_idx
  on public.notification_preferences(host_account_id);

alter table public.notification_preferences enable row level security;

-- Read: your own rows only. Cross-member and cross-account reads match nothing.
create policy notif_prefs_select on public.notification_preferences
  for select using (profile_id = auth.uid());

-- Insert: only for yourself, and only into an account you belong to.
create policy notif_prefs_insert on public.notification_preferences
  for insert with check (profile_id = auth.uid() and public.is_account_member(host_account_id));

-- Update: only your own rows, and a row can never be re-homed to someone else.
create policy notif_prefs_update on public.notification_preferences
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- updated_at maintenance via the shared helper every other table uses.
drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
