-- Property archiving: record WHEN a property was archived, and whether it was purged.
-- Archiving moves a property out of the Properties list into Reports, ordered
-- newest-archived-first. `updated_at` is the wrong proxy because any later edit
-- rewrites it. `purged_at` distinguishes a recoverable soft-delete from a
-- permanent purge whose data is genuinely gone (reports are retained).

alter table public.properties
  add column if not exists archived_at timestamptz;

-- Best-effort backfill for properties archived before this column existed.
update public.properties
   set archived_at = updated_at
 where status = 'archived'
   and archived_at is null;

create index if not exists properties_archived_idx
  on public.properties (host_account_id, archived_at desc)
  where status = 'archived' and deleted_at is null;

alter table public.properties
  add column if not exists purged_at timestamptz;
