-- Escalations lifecycle: explicit close-to-Reports archiving.
--
-- Stays, service requests, and extras orders archive via a generated
-- lifecycle_status. Escalations differ on purpose: closing is a deliberate host
-- action (a handled question stays visible in the inbox until the host closes
-- it), so lifecycle_status here is a real column flipped by close/reopen
-- actions, never a generated one.

alter table public.escalations
  add column if not exists lifecycle_status public.lifecycle_state not null default 'active',
  add column if not exists archived_at timestamptz;

-- The inbox reads active rows by property; keep that scan narrow.
create index if not exists escalations_active_inbox_idx
  on public.escalations (property_id, status, created_at desc)
  where lifecycle_status = 'active';

comment on column public.escalations.lifecycle_status is 'active = visible in the Escalations inbox. archived = closed by the host and listed under Reports. Set by the close/reopen actions, never auto-generated.';
comment on column public.escalations.archived_at is 'When the host closed (archived) the escalation. Null while active.';
