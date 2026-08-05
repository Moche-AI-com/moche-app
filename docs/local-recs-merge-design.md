# Local recommendations merge — design decision

Backlog ticket: **P4-12** (with P4-13 and P4-14 partially addressed, P6-07 deliberately declined).

P4-12's acceptance criterion is that an approved design doc exists before any
migration or UI code. This is that doc. It records a decision that differs from
the ticket's implied approach, and why.

## The two systems

| | `recommendations` | `nearby_places` |
|---|---|---|
| Origin | Host-authored by hand | Auto-discovered via Mapbox / OpenStreetMap |
| Lifecycle | Durable. Nothing regenerates it. Soft-deleted via `deleted_at`. | Disposable cache. Refreshed when the newest row is >30 days old. |
| Publish gate | `approved` boolean — an explicit host action | None; everything discovered is live unless `hidden` |
| Host intent | `host_preference` (`loved` / `neutral` / `disliked`), `priority_weight` | `host_starred` boolean |
| Free text | `description` (guest-facing), `host_note`, `distance_note` | `host_notes` |
| Measured data | none | `distance_m`, `rating`, `review_count`, `phone`, `place_id`, `photo_ref` |
| Editor page | `/dashboard/properties/[id]/recommendations`, gated on `can.editBrain` | `/dashboard/properties/[id]/nearby`, gated on `can.editProperty` |

Live production data at the time of this decision: 43 curated rows (15 approved,
7 loved) and 88 discovered rows, across 2 properties.

## The bug this uncovered

The concierge only ever read `nearby_places`. The recommendations manager told
hosts, verbatim:

> Approved places (and your favorites first) are shared with the concierge.

That was false. Every hand-written, explicitly approved recommendation — the
highest-intent local content in the product — was invisible to the AI. A host
could curate 43 places, approve 15, and none of them would ever be mentioned.

Fixing this, not reorganizing tables, was the actual value in this ticket.

## Decision: merge at read time, keep both tables

**No destructive migration.** The two tables are not two versions of one thing.
One is a disposable cache with a refresh job; the other is a durable human
artifact. Collapsing them forces a bad choice:

- Merge into `nearby_places` → the next 30-day refresh has to be taught to
  never touch host-authored rows, or it silently destroys hand-written
  descriptions. The refresh job becomes the most dangerous code in the repo.
- Merge into `recommendations` → the discovery pipeline has to write into a
  table with an approval gate, so either everything auto-discovered arrives
  pre-approved (defeating the gate) or hosts must hand-approve 88 scraped rows
  before their concierge knows the nearest pharmacy.
- Either direction is a one-way migration of live production data whose only
  benefit is schema tidiness.

Instead, `lib/local/merge.ts` unifies them **at read time**, as a pure
function. Consequences:

- Both tables keep the capabilities only they have.
- The refresh job stays untouched and stays safe.
- The unification rules are unit-tested without a database (30 tests).
- The decision is reversible. A future real migration can still happen, and the
  merge function documents exactly what semantics it would need to preserve.

### Merge rules

1. **Guest visibility.** A curated row reaches the guest only if `approved &&
   !hidden && host_preference !== 'disliked'`. `disliked` is excluded even when
   approved: marking a place disliked is a clearer statement of current intent
   than a stale approval flag. A discovered row reaches the guest if `!hidden`.
2. **Category normalization.** `recommendations.category` is free text and had
   already drifted — production rows use `attraction` where `nearby_places` uses
   `tourist_attraction`. Only observed divergences are aliased; unknown
   categories pass through so a new host-entered value still renders.
3. **Dedupe.** Keyed on `category` + a normalized name (lowercased, punctuation
   and generic suffixes like "Coffee" / "Restaurant" / "The" stripped), because
   the same shop is realistically "Blue Bottle Coffee" from Mapbox and "Blue
   Bottle" from the host. Category is part of the key so a park and a restaurant
   sharing a name are not collapsed.
4. **Chain-branch guard.** A name match alone is *not* a duplicate. Two rows
   collapse only if they are also within `SAME_PLACE_RADIUS_M` (150m) of each
   other, so two genuine branches of the same chain both survive and the dedupe
   cannot itself cause data loss. The guard applies only when both rows have a
   measured distance; curated rows have none, so a curated pick always attaches
   to its discovered twin — the nearest one, since discovered rows are processed
   nearest-first, making the result independent of caller ordering.

   The threshold is calibrated against production: the only two duplicate pairs
   that exist are the same restaurant 3m apart and the same convenience store
   30m apart, both provider double-indexing. 150m clears both by an order of
   magnitude while still splitting anything a guest would experience as a
   different location.
5. **Curated wins a collision, but absorbs facts.** The curated row survives and
   inherits the discovered twin's `distance_m` and `rating`, and a star on
   either record marks the merged place a favorite. Nothing measurable is lost
   by preferring the human-written record.
6. **Ranking** (P4-14): favorites hard-pin first, then `priority_weight`
   descending, then curated before discovered at equal weight, then rating
   descending (nulls last), then distance ascending (nulls last), then name for
   a stable total order.

P4-14 asked for a hard pin plus a `+0.3` relevance soft boost. The hard pin is
implemented. The soft boost is not: there is no relevance score in this ranking
path to add 0.3 to — ordering is lexicographic over explicit fields, which is
more predictable and more testable than a tuned magic number.

## Host surface: a lens, not a third editor

New page: `/dashboard/properties/[id]/local`, read-only.

It runs the same `mergeLocalPlaces` the concierge runs and renders the result,
with source badges ("Your pick" / "Discovered"), favorites pinned, and counts
for guest-visible / favorites / awaiting approval / hidden. It answers the one
question neither existing page could: *what will my guest actually be told?*
Because it calls the same function, it cannot drift from the concierge's
behavior.

It is deliberately not an editor. Editing stays in the two managers, which own
genuinely different workflows. The property detail page's "Nearby places" tile
is replaced by a "Local" tile pointing here, so there is one entry point; both
managers are reachable from it, and both link back.

The recommendations page is retitled "Your picks" and its copy corrected — it
now describes something true.

## P6-07 declined

P6-07 asks for a 308 redirect from the old recommendations route. Declined: that
route is still the curation editor, and a permanent redirect away from a working
editor would break host bookmarks and lose the approval and priority-weight UI
that has no equivalent elsewhere. The consolidation goal is met by making
`/local` the single entry point instead.

## What is not in scope here

- **P4-13 hybrid search** (local-first with a Mapbox fallback under 3 results) —
  a separate change to the discovery path, not the read path.
- Any change to `nearby_places` refresh behavior.
- Any schema change. This work required zero migrations.

## Verification

- `lib/local/merge.test.ts` — 35 tests covering visibility rules, category
  drift, dedupe, the chain-branch guard and its boundary, fact absorption,
  order-independence, and every ranking tie-breaker.
- Full suite: 21 files / 232 tests.
- `npx tsc --noEmit` clean; production build clean; lint clean apart from the two
  pre-existing warnings.
- Merge behavior checked against live production rows: 5 curated + 56 discovered
  and 10 curated + 32 discovered across the two properties, with 7 and 8 rows
  collapsing respectively — the dedupe does real work rather than being a no-op,
  and the curated rows it surfaces are content the concierge had never seen.
