-- Reviewed migration only. DO NOT apply manually against production.
-- Existing stay-code verified_at is not evidence of phone ownership.
alter table public.guest_access_sessions
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_opted_out_at timestamptz;

-- No backfill of legacy consent/verification: the exact session must consent.
-- Existing guest_access_sessions RLS remains enabled; writes stay service-only.
alter table public.guest_access_sessions enable row level security;

-- Destination-wide STOP suppression, storing only salted phone hashes.
-- No client policies or grants: guests, hosts, other accounts and unassigned
-- members must not read, delete or override a destination's suppression.
create table if not exists public.sms_suppressions (
  phone_hash text primary key,
  opted_out_at timestamptz not null default now()
);
alter table public.sms_suppressions enable row level security;
revoke all on public.sms_suppressions from public, anon, authenticated;
grant select, insert, update, delete on public.sms_suppressions to service_role;

comment on table public.sms_suppressions is
  'Service-only global SMS STOP list. Signed START never restores application consent automatically.';

-- profiles_self_update intentionally permits ordinary self-service edits. It
-- must not let a direct REST update forge OTP proof or swap a verified phone.
-- Keep existing profile grants and tenant policies unchanged. This INVOKER
-- trigger reads no tables and never elevates the caller's database privileges.
create or replace function public.protect_profile_phone_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.phone is distinct from old.phone
          or new.phone_verified_at is distinct from old.phone_verified_at)
  then
    raise exception 'Phone changes require server-side verification'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_phone_verification() from public, anon, authenticated;
grant execute on function public.protect_profile_phone_verification() to service_role;
drop trigger if exists trg_protect_profile_phone_verification on public.profiles;
create trigger trg_protect_profile_phone_verification
before update of phone, phone_verified_at on public.profiles
for each row execute function public.protect_profile_phone_verification();

-- Same-account membership alone does not grant access to every property's
-- private guest messages. A targeted notification is private to its recipient.
alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated
using (
  (public.is_account_member(host_account_id) or public.is_account_owner(host_account_id))
  and (property_id is null or public.can_access_property(property_id))
  and (recipient_profile_id is null or recipient_profile_id = (select auth.uid()))
);
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
using (
  (public.is_account_member(host_account_id) or public.is_account_owner(host_account_id))
  and (property_id is null or public.can_access_property(property_id))
  and (recipient_profile_id is null or recipient_profile_id = (select auth.uid()))
)
with check (
  (public.is_account_member(host_account_id) or public.is_account_owner(host_account_id))
  and (property_id is null or public.can_access_property(property_id))
  and (recipient_profile_id is null or recipient_profile_id = (select auth.uid()))
);
-- Clients may only mark authorized notifications read, not change their body,
-- broaden routing to a whole account, forge links, or truncate the table.
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
