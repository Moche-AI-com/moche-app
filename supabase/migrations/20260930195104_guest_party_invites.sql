-- Guest-initiated party invites ('Invite your group' in the guest portal).
-- Applied to production 2026-09-30 as version 20260930195104.
--
-- A party invite is an ordinary guest_access_links row (kind = 'stay') with
-- source = 'guest_share'. It redeems through the existing
-- /api/guest/[slug]/auth/redeem route, so session creation, expiry, revoke and
-- the redemption cap (lib/guest/stay-session.ts) are reused unchanged.
-- The raw token is never stored: token_hash only. The token is derived
-- server-side from the link id (lib/guest/party-invite.ts) so it can be
-- re-shown without persisting it. Service-role only, like the rest of the table.

alter table public.guest_access_links
  add column if not exists source text not null default 'host',
  add column if not exists created_by_guest_session_id uuid
    references public.guest_access_sessions(id) on delete set null;

do $$ begin
  alter table public.guest_access_links
    add constraint guest_access_links_source_chk check (source in ('host', 'guest_share'));
exception when duplicate_object then null; end $$;

comment on column public.guest_access_links.source is
  'host = minted by the host or dashboard. guest_share = party invite minted from the guest portal (Invite your group).';

-- At most one live party invite per stay. A consumed (full) or revoked link
-- frees the slot; the share route refuses to mint past a full link unless the
-- host revoked it.
create unique index if not exists guest_access_links_one_live_party_invite
  on public.guest_access_links (stay_id)
  where source = 'guest_share' and revoked_at is null and consumed_at is null;

alter table public.property_settings
  add column if not exists guest_share_enabled boolean not null default true,
  add column if not exists guest_share_max_joins integer not null default 10;

do $$ begin
  alter table public.property_settings
    add constraint property_settings_guest_share_max_joins_chk
    check (guest_share_max_joins between 1 and 30);
exception when duplicate_object then null; end $$;

comment on column public.property_settings.guest_share_max_joins is
  'Ceiling on joins through a guest party invite. Effective cap is max(stays.guest_count, this) because iCal imports set guest_count = 1.';

-- Notify the host every time someone joins through a party invite. A trigger,
-- so the existing redeem path needs no changes.
create or replace function public.notify_party_invite_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_name text;
begin
  if new.source <> 'guest_share' or new.redemption_count <= old.redemption_count then
    return new;
  end if;
  select p.host_account_id, p.display_name into v_host, v_name
    from public.properties p where p.id = new.property_id;
  if v_host is null then
    return new;
  end if;
  insert into public.notifications (host_account_id, property_id, kind, title, body, link)
  values (
    v_host,
    new.property_id,
    'system',
    'A guest joined through a group invite',
    format('%s of %s invite spots used at %s.', new.redemption_count, new.max_redemptions, v_name),
    format('/dashboard/properties/%s/guest-chat', new.property_id)
  );
  return new;
end $$;

revoke all on function public.notify_party_invite_join() from public, anon, authenticated;

drop trigger if exists guest_access_links_party_join_notify on public.guest_access_links;
create trigger guest_access_links_party_join_notify
  after update of redemption_count on public.guest_access_links
  for each row execute function public.notify_party_invite_join();
