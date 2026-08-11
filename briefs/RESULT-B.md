# Workstream B — Local places delivery report

## Shipped

- Applied the production `local_places` migration for canonical `places` and
  `property_place_recommendations`, including its idempotent legacy backfill.
- Added `local_places_approved_by_index` after the performance advisor identified
  the FK lookup as uncovered; the canonical migration file now includes the same
  index for fresh environments.
- Regenerated `lib/database.types.ts` from the live Supabase schema.
- Made `/dashboard/properties/[id]/local` the canonical Local overview and curation
  surface. It previews canonical rows with the shared guest ranker and exposes the
  Local manager to Brain editors.
- Redirected `/dashboard/properties/[id]/nearby` permanently to `/local`; retained
  now-unreachable nearby modules because their discovery actions remain useful
  server-side and have no external imports to safely delete in this change.
- Kept `/recommendations` reachable and added a Local overview banner.
- Added canonical-first concierge retrieval with legacy merge fallback only when
  no canonical relationship rows exist.
- Mirrored OSM refreshes into canonical tables without overwriting relationship
  curation on conflict; Mapbox records remain excluded by the durable-provider
  decision.
- Corrected recovery-step labels, including the exact-match result.
- Updated guest place-detail lookup to resolve canonical recommendation ids.

## Verification

- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed: 63 files, 698 tests.
- `npx next lint` — passed with the two documented pre-existing warnings only:
  `BrainCards.tsx` uses `<img>` and `RecommendationsManager.tsx` has a missing
  `useMemo` dependency.
- `npx next build` — passed.
- New Local unit coverage: 19 tests across dedupe, ranking, recovery, and
  canonical mapping/ranking.

## Supabase migration and advisors

- `apply_migration(local_places)` — succeeded for project
  `sqpdzhannyskdiyuarhp`.
- `generate_typescript_types` — completed and committed as the refreshed
  `lib/database.types.ts`.
- Security advisor: no security notice for either new canonical table; existing
  project-wide notices remain for older RLS/function/auth configuration.
- Performance advisor initially reported the new
  `property_place_recommendations.approved_by` FK as unindexed. The follow-up
  index migration succeeded, and the advisor no longer reports that FK. The only
  remaining canonical-table messages are expected unused-index informational
  notices immediately after creating the new indexes.

## Deliberately left undone

- No unrelated dependency-alert remediation or pre-existing lint-warning changes.
- Legacy nearby manager/action modules remain in the repository behind the
  permanent redirect; they are not rendered by any route and were retained to
  avoid deleting server-side discovery functionality outside this workstream.
