-- Portal code vault functions: restore the grant-level wall (2026-08-28)
--
-- portal_code_store / portal_code_read are SECURITY DEFINER wrappers around
-- Supabase Vault, intended for service_role only (20260824011532). The live
-- ACL (pg_proc.proacl) currently shows anon=X and authenticated=X on both —
-- the Supabase advisor 0028/0029 WARNs are accurate: each is reachable at
-- /rest/v1/rpc/portal_code_read|store. The functions' internal role-GUC guard
-- still refuses non-service_role callers with 42501, so nothing leaks today;
-- this migration restores the grant-level wall so the endpoint is unreachable
-- at all (defense in depth, matching 20260813125406's precedent for
-- brain_values_set_secret).

revoke execute on function public.portal_code_read(uuid) from public, anon, authenticated;
revoke execute on function public.portal_code_store(text, text) from public, anon, authenticated;

-- Idempotent restatement of the only intended caller.
grant execute on function public.portal_code_read(uuid) to service_role;
grant execute on function public.portal_code_store(text, text) to service_role;

comment on function public.portal_code_read(uuid)
  is 'service_role only. Reads a portal code back from Vault for host display. Never grant to anon or authenticated.';
comment on function public.portal_code_store(text, text)
  is 'service_role only. Stores a portal code in Vault. Never grant to anon or authenticated.';

-- Advisor 0009: guest_access_links carries two identical unique indexes — the
-- table's `token_hash text not null unique` constraint
-- (guest_access_links_token_hash_key) and a separately-created
-- guest_access_links_token_hash_uidx. Drop the redundant one; the constraint
-- remains and keeps enforcing uniqueness.
drop index if exists public.guest_access_links_token_hash_uidx;
