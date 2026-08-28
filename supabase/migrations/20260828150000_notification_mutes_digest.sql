-- Per-property mutes + daily digest queue
-- (follow-up to 20260828120000_notification_preferences.sql and
--  20260828133000_notification_channel_matrix.sql)
-- ----------------------------------------------------------------------------
-- 1. notification_property_mutes: one row = this member muted this category for
--    this one property. Rows are added and removed, never edited (no UPDATE
--    policy). The account's notification rows stay intact -- muting is a
--    per-viewer read-time filter plus a fan-out gate in notify().
-- 2. notification_digest_queue: emails deferred by a member's digest mode.
--    Written ONLY by the service role (notify() and the digest task); members
--    can read their own rows. There is deliberately no insert/update/delete
--    policy for authenticated users.
-- 3. profiles.email_digest_enabled: the member's global digest switch (default
--    off). When on, digest-eligible categories (extras, review nudges, property
--    knowledge) queue for the morning email instead of sending instantly.
--    Urgent and always-on paths are never digest-eligible.
--
-- RLS (per AGENTS.md hard boundary 8): mutes = own rows only, insert requires
-- account membership AND the property belonging to that account; digest queue =
-- read-only for members, service-role for writes. No anonymous path on either.

create table if not exists public.notification_property_mutes (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references public.host_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null check (category ~ '^[a-z][a-z0-9_]*$' and length(category) <= 40),
  created_at timestamptz not null default now(),
  unique (profile_id, property_id, category)
);

create index if not exists notification_property_mutes_profile_idx
  on public.notification_property_mutes(profile_id);

alter table public.notification_property_mutes enable row level security;

-- Read: your own mutes only.
create policy notif_mutes_select on public.notification_property_mutes
  for select using (profile_id = auth.uid());

-- Insert: yourself only, inside an account you belong to, and the property must
-- belong to that same account (no cross-account mute rows).
create policy notif_mutes_insert on public.notification_property_mutes
  for insert with check (
    profile_id = auth.uid()
    and public.is_account_member(host_account_id)
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.host_account_id = notification_property_mutes.host_account_id
    )
  );

-- Delete: your own mutes only. Rows are never updated, so there is no UPDATE policy.
create policy notif_mutes_delete on public.notification_property_mutes
  for delete using (profile_id = auth.uid());

create table if not exists public.notification_digest_queue (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references public.host_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_digest_queue_pending_idx
  on public.notification_digest_queue(profile_id) where sent_at is null;

alter table public.notification_digest_queue enable row level security;

-- Members can see their own queued items. Writes are service-role only: only
-- notify() and the digest task write, and both run with the service role, which
-- bypasses RLS.
create policy notif_digest_select on public.notification_digest_queue
  for select using (profile_id = auth.uid());

alter table public.profiles
  add column if not exists email_digest_enabled boolean not null default false;
