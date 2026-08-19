-- Brain sections: carry the canonical registry domain on every Brain row.
--
-- WHY A COLUMN AND NOT AN ENUM MIGRATION
-- The host-facing taxonomy is field_registry.json's 10 domains (Connectivity,
-- Access & Security, ...). Storage uses the `brain_category` enum (core,
-- appliances, ...). The two overlap on exactly one name, so the Brain UI rendered
-- two unrelated panels both titled "Coverage" and the import picker offered
-- categories unrelated to the gaps the Coverage Map asked the host to close.
--
-- Unifying by migrating the enum would mean backfilling every brain_items and
-- document_chunks row, re-touching public.match_property_chunks (the RPC guest
-- concierge answers are grounded on), and invalidating the golden eval corpus --
-- all to change strings the host reads. Instead `section` carries the precise
-- registry domain additively and `brain_category` is left completely untouched,
-- so retrieval, caching, and grounding behaviour are bit-identical after this
-- migration. lib/brain/taxonomy.ts owns the section <-> category mapping.
--
-- DIRECTIONALITY, AND WHY THERE IS NO BACKFILL
-- section -> category is total. category -> section is NOT: `core` is a historical
-- catch-all spanning connectivity, access, parking, and space_details. A backfill
-- would therefore have to guess, and a wrong guess is worse than a NULL: NULL
-- makes the application fall through to an explicitly-labelled best-effort
-- display guess, while a written-in wrong value looks like ground truth to the
-- next reader and to the AI routing pass. Existing rows keep section = NULL and
-- keep rendering exactly as before.
--
-- ADDITIVE AND IDEMPOTENT. No existing row changes, no policy changes, no DDL on
-- any enum. brain_items already carries brain_select / brain_write RLS keyed on
-- can_access_property / can_edit_property; a new column inherits both, which
-- scripts/gate2-contract-tests.sql now asserts rather than assumes.

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
