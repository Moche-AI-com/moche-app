-- Property archiving: record WHEN a property was archived.
--
-- Archiving a property now moves it out of the Properties list and into Reports,
-- alongside the archived service requests, extras, and stays that already live
-- there. Reports is ordered newest-archived-first, and `properties.status` alone
-- cannot answer "when did this happen" — `updated_at` is the wrong proxy because
-- any later edit (or a restore-then-archive cycle) rewrites it.
--
-- Nullable on purpose. Existing archived rows genuinely do not know their
-- archive date, and inventing one from `updated_at` would put fabricated dates
-- in front of hosts. The backfill below therefore only sets the column where we
-- have no better option than a best-effort value, and Reports falls back to
-- `updated_at` for display when it is null.
--
-- Restoring a property clears the column, so a round-trip leaves no stale date
-- behind to confuse the ordering.

alter table public.properties
  add column if not exists archived_at timestamptz;

-- Best-effort backfill for properties archived before this column existed.
-- `updated_at` is the closest signal available; leaving them null instead would
-- sort every historical archive together at the bottom of Reports.
update public.properties
   set archived_at = updated_at
 where status = 'archived'
   and archived_at is null;

-- Reports lists archived properties for one host account, newest first. The
-- partial index keeps that scan off the (much larger) set of live properties.
create index if not exists properties_archived_idx
  on public.properties (host_account_id, archived_at desc)
  where status = 'archived' and deleted_at is null;


-- Permanent delete: record that a property was purged, not merely soft-deleted.
--
-- "Delete for good" erases the property's Brain, documents, guest conversations,
-- access links, and settings, but deliberately RETAINS the host's reports
-- (archived service requests, completed extras, past stays). Those three tables
-- cascade from properties.id, so the property row cannot be deleted without
-- destroying the reports along with it. It therefore survives as a stripped
-- tombstone: display_name and slug only, with deleted_at and purged_at set.
--
-- `deleted_at` alone cannot distinguish the two states. A soft-deleted property
-- still holds all of its data and could in principle be restored; a purged one
-- cannot, and support must never tell a host otherwise. This column is the
-- difference, and it is what a future retention sweeper will key off to drop
-- tombstones once their reports age out.
alter table public.properties
  add column if not exists purged_at timestamptz;
