-- ============================================================================
-- WS-6 — Local Recs curation UX for hosts.
-- Additive, non-destructive migration. Safe to run repeatedly
-- (IF NOT EXISTS / CREATE OR REPLACE / guarded policy creation throughout).
--
-- Two independent additive slices:
--
-- 1. nearby_places (auto-discovered OSM places, WS-5) — adds `tags` and
--    `reviewed_at` so the same optional trip-planning tags and "has a host
--    looked at this" signal are available there too.
-- 2. recommendations (host-curated Local Recs, WS-6's actual target) — adds
--    `tags` and `price_level` for the WS-6 search/filter/tag requirements.
--    Curation STATE for `recommendations` is deliberately NOT a new column —
--    it is derived from the existing `approved` / `hidden` / `host_preference`
--    columns by `lib/local/curation.ts::deriveCurationStatus`, which is the
--    single authoritative mapping. See that file's header comment for the
--    full unreviewed/approved/favorite/rejected mapping.
--
-- Does NOT alter/drop existing tables, columns, or RLS policies — the
-- existing RLS policies on both tables are column-agnostic (USING/WITH CHECK
-- on property_id only) and already cover these new columns.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. nearby_places (WS-5 table) — optional tags + reviewed_at.
-- ---------------------------------------------------------------------------
alter table public.nearby_places
  add column if not exists tags text[] not null default '{}';

alter table public.nearby_places
  add column if not exists reviewed_at timestamptz;

create index if not exists nearby_places_property_reviewed_idx
  on public.nearby_places (property_id, reviewed_at);

-- ---------------------------------------------------------------------------
-- 2. recommendations (WS-6 table) — optional tags + price tier.
-- ---------------------------------------------------------------------------
alter table public.recommendations
  add column if not exists tags text[] not null default '{}';

alter table public.recommendations
  add column if not exists price_level smallint;

-- Backs the manager UI's status-filter queries (unreviewed/approved/
-- favorite/rejected are all derived from approved+hidden, see above).
create index if not exists recommendations_property_approved_hidden_idx
  on public.recommendations (property_id, approved, hidden);
