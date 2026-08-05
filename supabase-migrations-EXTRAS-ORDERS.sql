-- ===========================================================================
-- Extras orders (backlog P2-02, and the missing half of Phase 5).
--
-- WHAT THIS RESOLVES:
-- P2-02 was blocked on an open investigation: "confirm the name of the guest
-- extras *order* table". The answer is that no such table exists. `guest_extras`
-- is catalog-only (title, description, price_text, cta_label, sort_order,
-- active), and app/api/guest/[slug]/extras-request/route.ts routes a guest tap
-- through escalations + notify() without ever recording an order. That means:
--   * a host who answers the escalation and forgets has no list to come back to
--   * there is no way to tell requested from fulfilled from declined
--   * nothing lands in the Reports hub, so extras never appear in the archive
-- This migration adds the order table. The escalation path is KEPT (it is what
-- actually reaches the host by email/SMS); the order row is the durable record
-- alongside it.
--
-- WHY SNAPSHOT COLUMNS (item_title / item_price_text):
-- A host editing "Late checkout — $40" to "$60" next month must not silently
-- rewrite what a guest was quoted in a past order. The catalog id is kept as a
-- nullable FK for grouping, but the title and price the guest actually saw are
-- copied onto the order row and never updated. `on delete set null` on the FK
-- means deleting a catalog item does not destroy order history.
--
-- WHY GENERATED lifecycle_status:
-- Same reasoning as supabase-migrations-LIFECYCLE.sql: lifecycle is a
-- projection of `status`, not new state, so a GENERATED ... STORED column makes
-- drift structurally impossible and needs no backfill.
--
-- IDEMPOTENT: every step is guarded, so re-running this file is a no-op.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Status vocabulary
-- ---------------------------------------------------------------------------
-- 'requested'  guest asked, host has not acted
-- 'confirmed'  host said yes, not delivered yet
-- 'fulfilled'  delivered / done
-- 'declined'   host said no (unavailable, out of season, etc.)
-- 'cancelled'  guest or host called it off after the fact
do $$
begin
  if not exists (select 1 from pg_type where typname = 'extras_order_status') then
    create type public.extras_order_status as enum
      ('requested', 'confirmed', 'fulfilled', 'declined', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table if not exists public.extras_orders (
  id uuid primary key default gen_random_uuid(),

  -- Ownership / scoping. property_id is the RLS anchor, matching every other
  -- property-scoped table in this schema.
  property_id uuid not null references public.properties (id) on delete cascade,

  -- Context. All nullable so an order survives a stay being purged or a
  -- conversation being cleaned up; the order itself is the record of value.
  stay_id uuid references public.stays (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  escalation_id uuid references public.escalations (id) on delete set null,

  -- Catalog link + immutable snapshot of what the guest was shown.
  extra_id uuid references public.guest_extras (id) on delete set null,
  item_title text not null check (length(btrim(item_title)) between 1 and 200),
  item_price_text text check (item_price_text is null or length(item_price_text) <= 80),

  -- Advisory only. There is no cart, no tax, and no payment here: the host
  -- settles with the guest however they already do. Bounded so a bad client
  -- cannot write 10^9.
  quantity integer not null default 1 check (quantity between 1 and 20),

  guest_note text check (guest_note is null or length(guest_note) <= 1000),
  host_note text check (host_note is null or length(host_note) <= 1000),

  status public.extras_order_status not null default 'requested',

  -- Terminal states leave the Active queue. Mirrors service_requests/stays.
  lifecycle_status public.lifecycle_state
    generated always as (
      case
        when status in ('fulfilled', 'declined', 'cancelled') then 'archived'::public.lifecycle_state
        else 'active'::public.lifecycle_state
      end
    ) stored,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. archived_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.tg_extras_order_archived_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('fulfilled', 'declined', 'cancelled') then
    if old.status is null or old.status not in ('fulfilled', 'declined', 'cancelled') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $$;

-- Pinned for the same reason as the lifecycle trigger functions: removes
-- Supabase advisor 0011 (function_search_path_mutable) outright. The body only
-- calls now() (pg_catalog) and compares already-typed enum values.
alter function public.tg_extras_order_archived_at() set search_path = '';

drop trigger if exists extras_orders_archived_at on public.extras_orders;
create trigger extras_orders_archived_at
  before insert or update of status on public.extras_orders
  for each row execute function public.tg_extras_order_archived_at();

create or replace function public.tg_extras_order_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

alter function public.tg_extras_order_touch_updated_at() set search_path = '';

drop trigger if exists extras_orders_touch_updated_at on public.extras_orders;
create trigger extras_orders_touch_updated_at
  before update on public.extras_orders
  for each row execute function public.tg_extras_order_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
-- The queue query is "these properties, this lifecycle bucket, newest first",
-- exactly as with service_requests.
create index if not exists extras_orders_property_lifecycle_created_idx
  on public.extras_orders (property_id, lifecycle_status, created_at desc);

-- "What did this guest order during their stay" on the stay detail surface.
create index if not exists extras_orders_stay_idx
  on public.extras_orders (stay_id)
  where stay_id is not null;

-- Per-item counts for the catalog manager ("requested 12 times").
create index if not exists extras_orders_extra_idx
  on public.extras_orders (extra_id)
  where extra_id is not null;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.extras_orders enable row level security;

-- SELECT: anyone who can access the property. Same predicate as guest_extras.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extras_orders'
      and policyname = 'extras_orders_select_members'
  ) then
    create policy extras_orders_select_members
      on public.extras_orders
      for select
      to authenticated
      using (public.can_access_property(property_id));
  end if;
end $$;

-- UPDATE: editors only. USING *and* WITH CHECK, so a member cannot move a row
-- to a property they do not have edit rights on.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'extras_orders'
      and policyname = 'extras_orders_update_editors'
  ) then
    create policy extras_orders_update_editors
      on public.extras_orders
      for update
      to authenticated
      using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;
end $$;

-- NO INSERT policy and NO DELETE policy for `authenticated`, deliberately.
-- Orders are created by the guest request path, which runs through the service
-- role (createAdminClient) after validating the guest session against the
-- property. Letting a browser session insert directly would let a host
-- fabricate order history, and letting it delete would destroy the audit
-- record that the Reports hub depends on. Terminal states are reached via
-- `status = 'cancelled'`, not DELETE.

-- Trigger functions are not usefully callable by a client, but keep the public
-- schema surface tight anyway, matching supabase-migrations-P0-SECURITY.sql.
revoke execute on function public.tg_extras_order_archived_at() from public, anon, authenticated;
revoke execute on function public.tg_extras_order_touch_updated_at() from public, anon, authenticated;

commit;

-- ===========================================================================
-- ROLLBACK (run manually if this needs to be reverted):
--
--   drop table if exists public.extras_orders;
--   drop function if exists public.tg_extras_order_archived_at();
--   drop function if exists public.tg_extras_order_touch_updated_at();
--   drop type if exists public.extras_order_status;
-- ===========================================================================
