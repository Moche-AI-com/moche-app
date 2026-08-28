-- Brain sections: carry the canonical registry domain on every Brain row.
-- Additive and idempotent. No existing row changes, no policy changes, no DDL on
-- any enum. brain_items already carries brain_select / brain_write RLS keyed on
-- can_access_property / can_edit_property; a new column inherits both.

alter table public.brain_items
  add column if not exists section text;

-- The vocabulary is owned by field_registry.json (non-system domains) and mirrored
-- in lib/brain/taxonomy.ts. Enumerated in a CHECK rather than a foreign key to
-- public.field_registry so that a registry row being retired cannot orphan or
-- cascade into live Brain content. NULL stays legal: it means "written before
-- sections existed, fall back to the category guess".
alter table public.brain_items
  drop constraint if exists brain_items_section_check;
alter table public.brain_items
  add constraint brain_items_section_check
  check (section is null or section in (
    'connectivity',
    'access_security',
    'policies_money',
    'space_details',
    'parking',
    'amenities',
    'local_area',
    'house_rules',
    'checkout',
    'maintenance_escalation'
  ));

-- The unified Brain manager lists one section at a time, newest first.
create index if not exists brain_items_property_section_idx
  on public.brain_items (property_id, section, updated_at desc)
  where deleted_at is null;

comment on column public.brain_items.section is
  'Canonical field_registry.json domain_id. NULL = legacy row predating sections; '
  'the application falls back to a category-derived guess. See lib/brain/taxonomy.ts.';
