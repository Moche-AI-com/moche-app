-- Extras: category, favourite pin, advisory quantity ceiling
-- Backlog P5-01 / P5-05 / P5-06.
--
-- Decision (P5-01): keep the shipped per-property `guest_extras` table and extend
-- it, rather than splitting it into an account-wide `extras_catalog` +
-- `property_extras` pair. `guest_extras` is live, guest-facing, and already has
-- its own RLS policies; a two-table migration would put a working feature at risk
-- for benefits that are reachable additively. Full reasoning, including what
-- would have to change to revisit this, is in
-- docs/decisions/extras-catalog-shape.md.
--
-- Additive only. Every statement is idempotent, and no existing row changes
-- behaviour: `category` defaults to NULL, which the application normalizes to the
-- "more" bucket, so existing extras keep rendering with no host action.
--
-- Applied to project sqpdzhannyskdiyuarhp as migration
-- `extras_category_favorite_quantity`.

alter table public.guest_extras
  add column if not exists category text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists max_quantity integer;

-- Category is a fixed vocabulary owned by lib/guest/extras.ts. NULL stays legal
-- so existing rows need no backfill.
alter table public.guest_extras
  drop constraint if exists guest_extras_category_check;
alter table public.guest_extras
  add constraint guest_extras_category_check
  check (category is null or category in ('arrival','comfort','food','experiences','transport','more'));

-- Advisory ceiling on a single guest request. NULL means "use the app default".
alter table public.guest_extras
  drop constraint if exists guest_extras_max_quantity_check;
alter table public.guest_extras
  add constraint guest_extras_max_quantity_check
  check (max_quantity is null or (max_quantity >= 1 and max_quantity <= 10));

-- Matches the guest-facing order: is_favorite desc, category asc, title asc.
create index if not exists guest_extras_property_display_idx
  on public.guest_extras (property_id, is_favorite desc, category asc, title asc)
  where active;

comment on column public.guest_extras.category is 'Fixed guest-facing grouping key; NULL falls back to the app''s "more" bucket.';
comment on column public.guest_extras.is_favorite is 'Host pins this extra to the top of the guest list.';
comment on column public.guest_extras.max_quantity is 'Advisory per-request ceiling, 1-10. NULL means the app default.';

-- No RLS change: the existing guest_extras_{select,insert,update,delete} policies
-- are table-scoped and already cover these columns.
