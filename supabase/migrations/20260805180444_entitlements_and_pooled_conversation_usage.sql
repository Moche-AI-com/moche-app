alter table public.subscriptions
  add column if not exists trial_property_limit integer not null default 5;

alter table public.subscriptions
  add column if not exists is_read_only boolean not null default false;

comment on column public.subscriptions.trial_property_limit is
  'Property cap while status = trialing. Founding Member trials grant top-tier features with a lower cap.';
comment on column public.subscriptions.is_read_only is
  'Explicit read-only latch. OR-ed with the status-derived value in lib/billing/entitlements.ts; never the sole signal.';

create index if not exists subscriptions_trialing_trial_end_idx
  on public.subscriptions (trial_end)
  where status = 'trialing';

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

revoke all on function public.account_conversation_usage(uuid, timestamptz) from public, anon;
grant execute on function public.account_conversation_usage(uuid, timestamptz)
  to authenticated, service_role;

create index if not exists conversations_property_created_idx
  on public.conversations (property_id, created_at desc);
