-- Custom per-property "features" (pool, hot tub, grill, shed, …) — the "+ Add"
-- sections from the 2026-08-28 Brain directive. A feature is a knowledge container
-- the host (or an approved AI proposal) creates with three structured inputs the
-- concierge needs: where it is, whether guests may use it, and notes. brain_items
-- rows file under a feature via feature_id, and the AI routing guide lists the
-- property's features so extraction and update-merging can target them.

create table if not exists public.property_features (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  -- Set when the feature came from the built-in catalog (e.g. 'pool'); null for
  -- freeform entries. Used for icons and dedupe, never shown raw to hosts.
  catalog_key text check (catalog_key is null or catalog_key ~ '^[a-z0-9_]+$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  location text check (location is null or length(location) <= 240),
  guest_access text not null default 'yes' check (guest_access in ('yes', 'supervised', 'no')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_via text not null default 'host' check (created_via in ('host', 'ai')),
  -- Archive, never delete: knowledge filed under an archived feature stays
  -- retrievable, and the feature can come back without a migration.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.property_features is
  'Host-declared custom Brain sections (pool, grill, shed...). Containers for feature-scoped brain_items; the AI routing guide lists them per property.';

-- One active feature per (property, label) — case-insensitive so "Pool" and "pool"
-- cannot become two sections. Archived rows are excluded, so a re-added feature
-- reuses the label without touching history.
create unique index if not exists property_features_active_label_uidx
  on public.property_features (property_id, lower(label))
  where archived_at is null;

create index if not exists property_features_property_idx
  on public.property_features (property_id)
  where archived_at is null;

-- brain_items → feature link. Nullable: most knowledge still files under the 10
-- canonical sections. on delete set null keeps the item (it falls back to its
-- section) rather than cascading knowledge away with a feature row.
alter table public.brain_items
  add column if not exists feature_id uuid references public.property_features(id) on delete set null;

create index if not exists brain_items_feature_id_idx
  on public.brain_items (feature_id)
  where feature_id is not null;

alter table public.property_features enable row level security;

-- Same shape as property_appliances: members read, editors write. Guests never read
-- this table — the concierge reaches feature knowledge through brain_items chunks.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_features' and policyname = 'property_features_select_members') then
    create policy property_features_select_members on public.property_features for select to authenticated using (public.can_access_property(property_id));
    create policy property_features_insert_editors on public.property_features for insert to authenticated with check (public.can_edit_property(property_id));
    create policy property_features_update_editors on public.property_features for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
    create policy property_features_delete_editors on public.property_features for delete to authenticated using (public.can_edit_property(property_id));
  end if;
end $$;
