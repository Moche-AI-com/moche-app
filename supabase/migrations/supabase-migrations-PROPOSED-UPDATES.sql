-- ===========================================================================
-- proposed_updates — the AI approval queue (backlog P2-06).
--
-- WHY THIS TABLE EXISTS
-- Today, host-initiated URL ingestion runs the fetched page through an AI
-- standardization pass (lib/ingest/standardize.ts) and writes the model's
-- output straight into brain_items, where the concierge immediately starts
-- quoting it to guests. Nobody ever sees it first. If the model hallucinates a
-- check-out time or a parking rule, a guest is told that hallucination as fact.
--
-- This table is the review boundary. Anything AI-derived lands here as a
-- PROPOSAL. It only reaches guest-visible storage after a human with
-- can_edit_brain approves it, and the host can approve a corrected version
-- instead of the model's version. Both values are kept forever so "what did the
-- AI say vs. what did we ship" is always answerable.
--
-- DESIGN NOTES
--
-- 1. `field_path` is a dotted target, e.g. 'brain.listing_summary' or
--    'properties.city'. It is deliberately free-form text with a shape check
--    rather than an enum: the set of proposable fields will grow, and shipping
--    a migration for each new one is friction with no safety benefit. The real
--    safety gate is the application-side allowlist in lib/brain/proposals.ts —
--    a field_path with no allowlist entry can never be applied, so an unknown
--    or attacker-supplied path is inert rather than dangerous.
--
-- 2. Three value columns, not two:
--      original_value  what the field held before (null when it held nothing)
--      proposed_value  what the AI suggested — NEVER mutated after insert
--      applied_value   what actually got written on approval
--    On 'approved', applied_value == proposed_value. On 'modified', the host
--    edited it, and keeping proposed_value untouched is what makes the
--    acceptance criterion "both original and modified values are retained"
--    literally true in the data rather than only in an audit log.
--
-- 3. No INSERT or DELETE policy for `authenticated`, matching
--    supabase-migrations-EXTRAS-ORDERS.sql. Proposals are created by
--    server-side ingestion running as the service role. A browser session that
--    could insert here could fabricate a proposal and then approve its own
--    fabrication, which would defeat the entire point of the queue. Rows are
--    retired by status, never by DELETE, so the record survives.
--
-- 4. UPDATE is gated on can_edit_property(), whose definition is
--    "account owner OR property_members row with can_edit_brain = true" —
--    exactly the permission the backlog specifies for approving.
--
-- IDEMPOTENT: every step is guarded, so re-running this file is a no-op.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Status vocabulary
-- ---------------------------------------------------------------------------
-- 'pending'   awaiting a human decision
-- 'approved'  accepted verbatim; applied_value == proposed_value
-- 'modified'  accepted with host edits; applied_value differs from proposed
-- 'denied'    rejected; nothing was written anywhere
do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposed_update_status') then
    create type public.proposed_update_status as enum
      ('pending', 'approved', 'modified', 'denied');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table if not exists public.proposed_updates (
  id uuid primary key default gen_random_uuid(),

  -- property_id is the RLS anchor, as everywhere else in this schema.
  property_id uuid not null references public.properties (id) on delete cascade,
  -- host_account_id is denormalized so the account-wide queue count on the
  -- dashboard is one indexed read instead of a join through properties.
  host_account_id uuid not null references public.host_accounts (id) on delete cascade,

  status public.proposed_update_status not null default 'pending',

  -- Dotted target, e.g. 'brain.listing_summary', 'properties.city'.
  field_path text not null
    check (field_path ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' and length(field_path) <= 120),

  -- Short human-readable label for the review list ("Check-out time").
  label text not null check (length(btrim(label)) between 1 and 160),

  proposed_value jsonb not null,
  original_value jsonb,
  applied_value jsonb,

  source_type text not null check (source_type in (
    'listing_url',    -- Firecrawl/direct fetch of a listing page
    'document',       -- uploaded PDF/DOCX pass
    'text_paste',     -- host pasted raw text, AI-standardized
    'tone_migration', -- P4-07 freeform concierge_tone reclassification
    'nearby_refresh', -- Mapbox/OSM place refresh
    'ai_suggestion'   -- model-initiated gap fill
  )),
  -- Where it came from: a URL, a document id, a job id. Free text on purpose.
  source_ref text check (source_ref is null or length(source_ref) <= 2000),

  -- Model self-reported confidence, 0..1. Advisory only; never used to
  -- auto-approve anything.
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),

  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),

  -- Application outcome. A row can be approved and still fail to apply (e.g.
  -- the embedding call errors); keeping this separate from `status` means the
  -- host's decision is never silently rolled back by an infrastructure fault.
  applied_at timestamptz,
  apply_error text check (apply_error is null or length(apply_error) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A pending row has not been reviewed; a reviewed row has a timestamp.
  -- Structurally prevents "denied 3 weeks ago, by nobody, at no time".
  constraint proposed_updates_review_consistency check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  ),
  -- 'modified' without an applied_value is meaningless.
  constraint proposed_updates_modified_has_value check (
    status <> 'modified' or applied_value is not null
  )
);

-- ---------------------------------------------------------------------------
-- 3. Timestamp maintenance
-- ---------------------------------------------------------------------------
create or replace function public.tg_proposed_update_review_stamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Stamp the review time on the transition out of 'pending' so the API cannot
  -- forget to, and clear it on a (rare) reopen back to pending.
  if new.status <> 'pending' and (old.status is null or old.status = 'pending') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif new.status = 'pending' then
    new.reviewed_at := null;
  end if;
  return new;
end $$;

-- Pinned search_path for the same reason as every other trigger function here:
-- it removes Supabase advisor 0011 (function_search_path_mutable) outright. The
-- body only calls now() from pg_catalog.
alter function public.tg_proposed_update_review_stamp() set search_path = '';

drop trigger if exists proposed_updates_review_stamp on public.proposed_updates;
create trigger proposed_updates_review_stamp
  before insert or update on public.proposed_updates
  for each row execute function public.tg_proposed_update_review_stamp();

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
-- Per-property review page: "this property, pending, oldest first".
create index if not exists proposed_updates_property_status_created_idx
  on public.proposed_updates (property_id, status, created_at);

-- Account-wide dashboard tile: pending count + oldest pending age in one scan.
create index if not exists proposed_updates_account_pending_idx
  on public.proposed_updates (host_account_id, created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.proposed_updates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'proposed_updates'
      and policyname = 'proposed_updates_select_members'
  ) then
    create policy proposed_updates_select_members
      on public.proposed_updates
      for select
      to authenticated
      using (public.can_access_property(property_id));
  end if;
end $$;

-- USING *and* WITH CHECK: a member must have edit rights on the row's property
-- both before and after the write, so a row cannot be moved into a property the
-- caller cannot edit.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'proposed_updates'
      and policyname = 'proposed_updates_update_editors'
  ) then
    create policy proposed_updates_update_editors
      on public.proposed_updates
      for update
      to authenticated
      using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;
end $$;

-- Deliberately no INSERT / DELETE policy for `authenticated`. See header note 3.

revoke execute on function public.tg_proposed_update_review_stamp()
  from public, anon, authenticated;

commit;

-- ===========================================================================
-- ROLLBACK (run manually if this needs to be reverted):
--
--   drop table if exists public.proposed_updates;
--   drop function if exists public.tg_proposed_update_review_stamp();
--   drop type if exists public.proposed_update_status;
-- ===========================================================================
