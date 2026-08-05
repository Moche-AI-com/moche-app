# Extras data shape: extend `guest_extras` instead of splitting it

Backlog item: **P5-01** ("decide the Extras catalog shape"), with P5-05 and P5-06
delivered on top of the outcome.

Status: **decided and implemented**. Revisit only under the triggers listed at the
end of this document.

## The question

The backlog proposed replacing the single per-property `guest_extras` table with a
pair:

- `extras_catalog` — account-wide reusable extras a host defines once
- `property_extras` — per-property enablement, price override, and ordering

That shape is genuinely better for one specific host: a portfolio operator who
offers the same late checkout across thirty listings and wants to edit it in one
place.

## The decision

Keep the existing per-property `guest_extras` table and extend it additively with
three columns:

| Column | Type | Purpose |
| --- | --- | --- |
| `category` | `text`, nullable, CHECK against a fixed vocabulary | Groups extras into guest-facing tiles (P5-05) |
| `is_favorite` | `boolean not null default false` | Host pins an extra to the top of the guest list (P5-06) |
| `max_quantity` | `integer`, nullable, CHECK 1..10 | Advisory per-request ceiling |

Migration: `supabase-migrations-EXTRAS-CATEGORY.sql`, applied as
`extras_category_favorite_quantity`.

## Why

1. **`guest_extras` is live and guest-facing.** It already serves the portal, the
   `extras_orders` flow, and the escalation path. A two-table split is a data
   migration of a working revenue feature, and every row would have to be
   rewritten and re-pointed while guests are able to hit the endpoint. The upside
   is host convenience; the downside is a broken request path for a paying guest.
   That trade is not worth taking during launch preparation.

2. **The split solves a problem no current account has.** Reuse across properties
   only pays off above roughly ten listings with genuinely identical extras. The
   feature can be measured before it is engineered: if hosts start creating the
   same extra title across many properties, that is the signal.

3. **Everything P5 actually asked for is reachable additively.** Categories,
   favourites, and quantity ceilings are per-extra attributes, not relationships.
   None of them needed a new table.

4. **The split is still available later, and cheaply.** Because `category` is a
   fixed vocabulary and `guest_extras` rows already carry `property_id`, a future
   `extras_catalog` can be introduced as a parent with `guest_extras.catalog_id`
   nullable, backfilled by grouping on `(host_account_id, title)`. No guest-facing
   downtime, and no need to undo anything shipped here.

## What was NOT done, deliberately

- **No RLS change.** The existing `guest_extras_{select_members, insert_editors,
  update_editors, delete_editors}` policies are table-scoped and already cover
  the new columns. `get_advisors` was run after the DDL and reported no new
  findings.
- **No backfill.** `category` stays `NULL` on every existing row, and the
  application normalizes `NULL` to the `more` bucket, so existing extras keep
  rendering with no host action and no migration risk.
- **No free-text categories.** A `CHECK` constraint plus the vocabulary in
  `lib/guest/extras.ts` keeps the guest tile list from degrading into forty
  one-item categories.
- **No price maths anywhere.** `max_quantity` is advisory, and the guest flow
  never computes a subtotal, tax, or fee line. An extras request is a message to
  the host, who confirms availability and price. This is deliberate: computing a
  total would imply a charge the platform does not take.

## Ordering rule (P5-06)

The guest-facing order is `is_favorite DESC, category ASC, name ASC`, with `id` as
a final tiebreaker so the order is total and stable across renders.

It is implemented in `sortExtras` in `lib/guest/extras.ts` rather than left to
SQL alone, because the extras list is fetched in more than one place and the order
a guest sees should not depend on which query ran. The database query orders the
same way as an index-friendly head start, and
`guest_extras_property_display_idx` covers it for active rows.

Tests: `lib/guest/extras.test.ts`, including fixtures where each sort key ties in
turn.

## Revisit when

- A single host account defines the same extra title on more than ten properties.
- Hosts ask for one-place editing of a shared extra.
- Per-property price overrides on a shared extra become a requested feature.

Any of those makes the catalog split worth its migration cost. Until then, the
additive shape carries less risk for the same guest experience.
