create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references public.host_accounts(id) on delete cascade,
  -- Text + lower(email) indexes avoid depending on citext being installed.
  email text not null check (email = lower(email)),
  role member_role not null,
  can_edit_brain boolean not null default false,
  can_reply_guests boolean not null default false,
  can_receive_escalations boolean not null default false,
  can_resolve_maintenance boolean not null default false,
  can_view_analytics boolean not null default false,
  -- Empty is the universal account scope.
  property_ids uuid[] not null default '{}',
  invited_by uuid not null references public.profiles(id),
  -- The raw 32-byte token only appears in the one-time email URL.
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_profile_id uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists member_invites_account_created_idx
  on public.member_invites(host_account_id, created_at desc);

create index if not exists member_invites_token_hash_idx
  on public.member_invites(token_hash);

-- Index predicates must be immutable, so `expires_at > now()` cannot appear here.
-- The trigger below revokes expired rows first, so this enforces "one live invite
-- per account/email" without a non-working time predicate.
create unique index if not exists member_invites_one_live_email_per_account_idx
  on public.member_invites(host_account_id, lower(email))
  where accepted_at is null and revoked_at is null;

create or replace function public.revoke_expired_member_invite_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.member_invites
  set revoked_at = now()
  where host_account_id = new.host_account_id
    and lower(email) = lower(new.email)
    and accepted_at is null
    and revoked_at is null
    and expires_at <= now();
  return new;
end;
$$;

drop trigger if exists trg_revoke_expired_member_invite_before_insert on public.member_invites;
create trigger trg_revoke_expired_member_invite_before_insert
before insert on public.member_invites
for each row execute function public.revoke_expired_member_invite_before_insert();

-- Trigger-only helper: never expose a mutating RPC endpoint through PostgREST.
revoke execute on function public.revoke_expired_member_invite_before_insert()
  from public, anon, authenticated;

alter table public.member_invites enable row level security;

drop policy if exists member_invites_owner_select on public.member_invites;
create policy member_invites_owner_select
on public.member_invites
for select
to authenticated
using ((select public.is_account_owner(host_account_id)));

drop policy if exists member_invites_owner_insert on public.member_invites;
create policy member_invites_owner_insert
on public.member_invites
for insert
to authenticated
with check ((select public.is_account_owner(host_account_id)));

drop policy if exists member_invites_owner_update on public.member_invites;
create policy member_invites_owner_update
on public.member_invites
for update
to authenticated
using ((select public.is_account_owner(host_account_id)))
with check ((select public.is_account_owner(host_account_id)));

-- No anon policy by design: acceptance uses the service-role admin client after
-- hashing the submitted token, so neither hashes nor invitee emails enter the
-- public Data API.
revoke all on table public.member_invites from public, anon, authenticated;
grant select, insert, update on table public.member_invites to authenticated;
grant select, insert, update, delete on table public.member_invites to service_role;
