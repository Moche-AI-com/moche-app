-- Lifecycle pattern for service_requests and stays (backlog P2-01, P2-03).
--
-- WHY GENERATED COLUMNS, NOT A STORED PARALLEL STATUS:
-- The backlog proposed adding a writable `lifecycle_status` column plus a
-- backfill. That invites permanent drift: every future write path that sets
-- `status` would also have to remember to set `lifecycle_status`, and the day
-- one of them forgets, a resolved ticket silently stays in the Active tab.
-- Both tables already have an authoritative status enum, so lifecycle is a
-- *projection* of existing state, not new state. A GENERATED ... STORED column
-- makes drift structurally impossible, needs no backfill, and needs zero
-- changes to any existing insert/update path. It is still a real stored column,
-- so it indexes exactly like a normal one.
--
-- WHY NO `archived_reason`:
-- `service_requests.resolution_notes` already carries the host's reason for
-- closing a ticket, and `stays` has `host_notes`. Adding a second free-text
-- reason field would give two places to look for the same answer. Deliberately
-- omitted. `archived_at` IS added, because "when did this leave the active
-- list" is genuinely not derivable from any existing column.

begin;

-- ---------------------------------------------------------------------------
-- Shared lifecycle vocabulary
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lifecycle_state') then
    create type public.lifecycle_state as enum ('active', 'archived');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- service_requests
-- ---------------------------------------------------------------------------
-- service_status is ('new','acknowledged','in_progress','waiting_on_guest',
-- 'resolved','closed'). resolved/closed are terminal from the host's point of
-- view, so they map to archived; everything else is still live work.
alter table public.service_requests
  add column if not exists lifecycle_status public.lifecycle_state
    generated always as (
      case
        when status in ('resolved', 'closed') then 'archived'::public.lifecycle_state
        else 'active'::public.lifecycle_state
      end
    ) stored;

alter table public.service_requests
  add column if not exists archived_at timestamptz;

-- Backfill archived_at for tickets that are ALREADY terminal. updated_at is the
-- best available approximation of when they were closed; there is no better
-- signal in the existing schema, and pretending otherwise would be worse than
-- being explicit about it here.
update public.service_requests
   set archived_at = updated_at
 where status in ('resolved', 'closed')
   and archived_at is null;

-- Maintain archived_at on transition. Set on the way in, cleared on the way
-- back out, so a reopened ticket does not keep a stale archive timestamp.
create or replace function public.tg_service_request_archived_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('resolved', 'closed') then
    if old.status is null or old.status not in ('resolved', 'closed') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $$;

drop trigger if exists service_requests_archived_at on public.service_requests;
create trigger service_requests_archived_at
  before insert or update of status on public.service_requests
  for each row execute function public.tg_service_request_archived_at();

-- ---------------------------------------------------------------------------
-- stays
-- ---------------------------------------------------------------------------
-- stay_status is ('upcoming','active','completed','revoked'). deleted_at is a
-- separate soft-delete concern and is deliberately NOT folded in here: a
-- deleted stay should disappear from every list, not move to the Past tab.
alter table public.stays
  add column if not exists lifecycle_status public.lifecycle_state
    generated always as (
      case
        when status in ('completed', 'revoked') then 'archived'::public.lifecycle_state
        else 'active'::public.lifecycle_state
      end
    ) stored;

alter table public.stays
  add column if not exists archived_at timestamptz;

update public.stays
   set archived_at = updated_at
 where status in ('completed', 'revoked')
   and archived_at is null;

create or replace function public.tg_stay_archived_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('completed', 'revoked') then
    if old.status is null or old.status not in ('completed', 'revoked') then
      new.archived_at := now();
    end if;
  else
    new.archived_at := null;
  end if;
  return new;
end $$;

drop trigger if exists stays_archived_at on public.stays;
create trigger stays_archived_at
  before insert or update of status on public.stays
  for each row execute function public.tg_stay_archived_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Every list query is "this property, this lifecycle bucket, newest first",
-- and the Reports hub adds "these properties, archived, newest first". A
-- composite index in exactly that column order serves both without a sort.
create index if not exists service_requests_property_lifecycle_created_idx
  on public.service_requests (property_id, lifecycle_status, created_at desc);

create index if not exists stays_property_lifecycle_created_idx
  on public.stays (property_id, lifecycle_status, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants / RLS
-- ---------------------------------------------------------------------------
-- No RLS change is needed or wanted. Both tables already have policies scoped
-- via can_access_property(); a new column inherits them, and the trigger
-- functions run in the caller's context (no SECURITY DEFINER) so they cannot be
-- used to bypass anything. The functions are plain triggers and are not
-- callable usefully by a client, but revoke anyway to keep the public schema
-- surface tight, matching the convention in supabase-migrations-P0-SECURITY.sql.
revoke execute on function public.tg_service_request_archived_at() from public, anon, authenticated;
revoke execute on function public.tg_stay_archived_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Applied as migration: lifecycle_trigger_fns_pin_search_path
--
-- Supabase advisor 0011 (function_search_path_mutable) flagged both trigger
-- functions above. They are SECURITY INVOKER, so the practical escalation risk
-- was small, but pinning search_path removes the attack class outright and
-- costs nothing here: the bodies only call now() (pg_catalog, always
-- implicitly searched) and compare enum literals against an already-typed NEW
-- column, so no schema resolution is needed at runtime.
-- ---------------------------------------------------------------------------
alter function public.tg_service_request_archived_at() set search_path = '';
alter function public.tg_stay_archived_at() set search_path = '';

commit;
