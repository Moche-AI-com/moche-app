-- ============================================================================
-- ENTITLEMENTS + POOLED CONVERSATION USAGE  (backlog P3-04, P3-07)
--
-- Two things:
--   1. Two entitlement columns on `subscriptions`. `subscriptions` already exists
--      with a unique host_account_id, `plan`, `status` and `trial_end`, so this
--      extends the existing row rather than adding a side table. A side table
--      would have meant a second read on every entitlement check and a second
--      place for the two to disagree.
--   2. A pooled conversation counter, per host account and per period. There is
--      NO new counter table: `conversations` already carries property_id +
--      created_at, and `properties` carries host_account_id, so the pooled count
--      is derivable. A denormalised counter would be a second source of truth
--      that can drift from the rows it counts.
--
-- Safe to re-run.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Entitlement columns
-- ---------------------------------------------------------------------------

-- Property cap that applies while status = 'trialing'. Founding Member trials grant
-- top-tier FEATURES but a lower property cap than the top tier's own limit, so the
-- cap cannot be read off the plan. Default 5 matches FOUNDING_TRIAL_PROPERTY_LIMIT
-- in lib/constants.ts. Nullable is not useful here: every trialing row needs a cap.
alter table public.subscriptions
  add column if not exists trial_property_limit integer not null default 5;

-- Hard read-only latch. The app ALSO derives read-only from status (see
-- READ_ONLY_STATUSES in lib/billing/entitlements.ts), so this column is an
-- override for cases status cannot express: an expired trial that never converted,
-- or an account put into read-only by support. Never the only signal.
alter table public.subscriptions
  add column if not exists is_read_only boolean not null default false;

comment on column public.subscriptions.trial_property_limit is
  'Property cap while status = trialing. Founding Member trials grant top-tier features with a lower cap.';
comment on column public.subscriptions.is_read_only is
  'Explicit read-only latch. OR-ed with the status-derived value in lib/billing/entitlements.ts; never the sole signal.';

-- Lets the trial-warning job find trials about to end without scanning the table.
create index if not exists subscriptions_trialing_trial_end_idx
  on public.subscriptions (trial_end)
  where status = 'trialing';

-- ---------------------------------------------------------------------------
-- 2. Pooled conversation usage
-- ---------------------------------------------------------------------------

-- Conversations started by any property under one host account since p_since.
--
-- SECURITY DEFINER because it reads across `properties` and `conversations` for a
-- whole account, which a single member's RLS predicates would not span. The
-- is_account_member guard is therefore mandatory and is checked BEFORE any read:
-- without it, any signed-in user could count any account's usage.
create or replace function public.account_conversation_usage(
  p_host_account_id uuid,
  p_since timestamptz
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  -- service_role bypasses the membership check (webhooks and scheduled jobs have no
  -- session). Every other caller must be a member of the account being counted.
  if current_setting('role', true) is distinct from 'service_role'
     and not public.is_account_member(p_host_account_id) then
    raise exception 'not a member of this account' using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.conversations c
  join public.properties p on p.id = c.property_id
  where p.host_account_id = p_host_account_id
    and c.created_at >= p_since;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.account_conversation_usage(uuid, timestamptz) is
  'Pooled guest-conversation count for a host account since a timestamp. Derived from conversations + properties; there is no counter table.';

-- Privilege comes from the implicit PUBLIC grant, so revoking from anon alone is a
-- no-op. Revoke PUBLIC first, then grant only the roles that should hold it.
revoke all on function public.account_conversation_usage(uuid, timestamptz) from public, anon;
grant execute on function public.account_conversation_usage(uuid, timestamptz)
  to authenticated, service_role;

-- Supports the per-account count: conversations are filtered by property then by
-- date, so the composite index serves both predicates.
create index if not exists conversations_property_created_idx
  on public.conversations (property_id, created_at desc);

commit;

-- ---------------------------------------------------------------------------
-- Verification (run manually; assertions land in a temp table because
-- `raise notice` output is not returned by the SQL API)
-- ---------------------------------------------------------------------------
-- create temp table _v(check_name text, ok boolean, detail text);
--
-- insert into _v
-- select 'columns_exist',
--        count(*) = 2,
--        string_agg(column_name, ',')
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'subscriptions'
--   and column_name in ('trial_property_limit', 'is_read_only');
--
-- insert into _v
-- select 'anon_cannot_execute',
--        not has_function_privilege('anon', 'public.account_conversation_usage(uuid, timestamptz)', 'EXECUTE'),
--        'anon EXECUTE';
--
-- insert into _v
-- select 'authenticated_can_execute',
--        has_function_privilege('authenticated', 'public.account_conversation_usage(uuid, timestamptz)', 'EXECUTE'),
--        'authenticated EXECUTE';
--
-- select * from _v;
