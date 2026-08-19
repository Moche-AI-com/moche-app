-- ===========================================================================
-- WS-2 — Rename "upsell offers" to "guest extras".
--
-- Guest-facing copy must never say "upsell". This migration renames the table,
-- its indexes, and its RLS policies from upsell_offers -> guest_extras. It is
-- ADDITIVE-SAFE in the sense that it destroys no data and no columns: the rows,
-- the column set, the foreign key, and the access rules are all preserved
-- exactly. Only identifiers change.
--
-- IDEMPOTENT: every step is guarded, so re-running this file is a no-op.
-- REVERSIBLE: see the rollback block at the bottom of this file (commented).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Rename the table. Guarded so a re-run (or a fresh DB where the new name
--    already exists) does nothing.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'upsell_offers'
  ) and not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'guest_extras'
  ) then
    alter table public.upsell_offers rename to guest_extras;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Rename the indexes to match. Postgres keeps the old index names after a
--    table rename, which would leave "upsell" in the schema.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'upsell_offers_property_idx'
  ) then
    alter index public.upsell_offers_property_idx rename to guest_extras_property_idx;
  end if;

  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'upsell_offers_property_sort_idx'
  ) then
    alter index public.upsell_offers_property_sort_idx rename to guest_extras_property_sort_idx;
  end if;

  -- The primary key's backing index keeps its original name too.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'upsell_offers_pkey'
  ) then
    alter index public.upsell_offers_pkey rename to guest_extras_pkey;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2b. Rename the foreign key constraint to properties(id). Renaming a
--     constraint does not revalidate or drop it, so the ON DELETE CASCADE
--     behaviour is preserved untouched.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'guest_extras'
      and c.conname = 'upsell_offers_property_id_fkey'
  ) then
    alter table public.guest_extras
      rename constraint upsell_offers_property_id_fkey to guest_extras_property_id_fkey;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. Rename the RLS policies. The policy BODIES are unchanged — same
--    can_access_property / can_edit_property predicates, same target role —
--    so the access model is byte-for-byte identical to before the rename.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'guest_extras'
      and policyname = 'upsell_offers_select_members'
  ) then
    alter policy upsell_offers_select_members
      on public.guest_extras rename to guest_extras_select_members;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'guest_extras'
      and policyname = 'upsell_offers_insert_editors'
  ) then
    alter policy upsell_offers_insert_editors
      on public.guest_extras rename to guest_extras_insert_editors;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'guest_extras'
      and policyname = 'upsell_offers_update_editors'
  ) then
    alter policy upsell_offers_update_editors
      on public.guest_extras rename to guest_extras_update_editors;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'guest_extras'
      and policyname = 'upsell_offers_delete_editors'
  ) then
    alter policy upsell_offers_delete_editors
      on public.guest_extras rename to guest_extras_delete_editors;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4. Belt-and-braces: RLS must still be enabled after the rename. ALTER TABLE
--    RENAME preserves it, but assert rather than assume — an unprotected table
--    in the public schema is reachable through the Data API.
-- ---------------------------------------------------------------------------
alter table public.guest_extras enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Rename the property_settings.modules JSON key 'upsell' -> 'extras'.
--    The host's on/off VALUE is carried over, so a host who had the module
--    enabled keeps it enabled. Guarded on the old key existing, so re-running
--    is a no-op and rows already migrated are left alone.
-- ---------------------------------------------------------------------------
update public.property_settings
set modules = (modules - 'upsell') || jsonb_build_object('extras', modules -> 'upsell')
where modules ? 'upsell';

-- ===========================================================================
-- ROLLBACK (run manually if this needs to be reverted):
--
--   alter table public.guest_extras rename to upsell_offers;
--   alter index public.guest_extras_pkey rename to upsell_offers_pkey;
--   alter table public.upsell_offers rename constraint
--     guest_extras_property_id_fkey to upsell_offers_property_id_fkey;
--   alter index public.guest_extras_property_idx
--     rename to upsell_offers_property_idx;
--   alter index public.guest_extras_property_sort_idx
--     rename to upsell_offers_property_sort_idx;
--   alter policy guest_extras_select_members
--     on public.upsell_offers rename to upsell_offers_select_members;
--   alter policy guest_extras_insert_editors
--     on public.upsell_offers rename to upsell_offers_insert_editors;
--   alter policy guest_extras_update_editors
--     on public.upsell_offers rename to upsell_offers_update_editors;
--   alter policy guest_extras_delete_editors
--     on public.upsell_offers rename to upsell_offers_delete_editors;
--   update public.property_settings
--   set modules = (modules - 'extras') || jsonb_build_object('upsell', modules -> 'extras')
--   where modules ? 'extras';
-- ===========================================================================
