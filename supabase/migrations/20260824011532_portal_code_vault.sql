-- Ticket 2B (issue #59) — re-viewable guest portal codes via the Vault envelope.
--
-- Today stay-link visit codes (guest_access_links.code_hash) and per-guest PINs
-- (stay_guests.pin_hash) are hash-only: the raw code is shown once at mint and can
-- never be displayed again, which forces hosts into a regenerate loop. This migration
-- gives each code a second home in Supabase Vault — the hash stays the verification
-- path, the Vault secret is display-only, read server-side after requirePropertyAccess.
--
-- Follows the GATE3-VAULT-ENVELOPE pattern: `vault:<uuid>` refs with a format check,
-- SECURITY DEFINER write/read wrappers (vault.create_secret is not grantable to
-- client roles), search_path hardened, EXECUTE revoked from PUBLIC.

alter table public.guest_access_links
  add column if not exists code_secret_ref text;

alter table public.guest_access_links
  drop constraint if exists guest_access_links_code_secret_ref_format;

alter table public.guest_access_links
  add constraint guest_access_links_code_secret_ref_format
  check (
    code_secret_ref is null
    or code_secret_ref ~ '^vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

alter table public.stay_guests
  add column if not exists pin_secret_ref text;

alter table public.stay_guests
  drop constraint if exists stay_guests_pin_secret_ref_format;

alter table public.stay_guests
  add constraint stay_guests_pin_secret_ref_format
  check (
    pin_secret_ref is null
    or pin_secret_ref ~ '^vault:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- Store a code in Vault. service_role only: every caller (stay-link mint, stay
-- auto-mint, code regenerate, guest-ID create) is a server route that has already
-- authorized the host through requirePropertyAccess before reaching SQL — the same
-- argument as brain_values_set_secret's service_role branch.
create or replace function public.portal_code_store(p_secret text, p_name text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(current_setting('role', true), '');
begin
  if v_role <> 'service_role' then
    raise exception 'portal codes are stored server-side only' using errcode = '42501';
  end if;
  if p_secret is null or length(btrim(p_secret)) = 0 then
    raise exception 'secret value must not be empty' using errcode = '23514';
  end if;
  return vault.create_secret(p_secret, p_name, 'Guest portal visit code');
end;
$function$;

revoke all on function public.portal_code_store(text, text) from public;
grant execute on function public.portal_code_store(text, text) to service_role;

-- Read a code back for display. service_role only for the same reason; the
-- decrypted value never touches a client-role-readable column.
create or replace function public.portal_code_read(p_secret_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(current_setting('role', true), '');
  v_secret text;
begin
  if v_role <> 'service_role' then
    raise exception 'portal codes are read server-side only' using errcode = '42501';
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
    where ds.id = p_secret_id;
  return v_secret;
end;
$function$;

revoke all on function public.portal_code_read(uuid) from public;
grant execute on function public.portal_code_read(uuid) to service_role;

-- No backfill: codes minted before this migration exist hash-only and cannot be
-- recovered. They keep working and display masked; codes minted from here on are
-- re-viewable by the host for the life of the stay.
