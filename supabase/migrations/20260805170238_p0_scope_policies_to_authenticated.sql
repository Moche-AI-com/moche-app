-- P0: scope host-facing RLS policies to `authenticated`, then close anon
-- EXECUTE on the SECURITY DEFINER helper functions.
--
-- WHY (this replaces a naive `revoke ... from anon`):
-- 45 policies in the public schema were created without a TO clause, so they
-- applied to PUBLIC - every role, including anon. All 45 are auth.uid()-scoped,
-- so anon could never match a row; the PUBLIC scope was incidental.
--
-- Side effect: revoking anon EXECUTE on can_access_property / is_account_member
-- / property_account turned an anon SELECT from "0 rows" into
-- "ERROR: permission denied for function is_account_member", because Postgres
-- evaluates the policy expression as the querying role. A regression test
-- caught this before it shipped.
--
-- Correct order:
--   1. Scope the incidentally-PUBLIC policies to `authenticated`, so anon has
--      no matching policy and the helper is never invoked as anon.
--   2. Only then revoke anon EXECUTE on the helpers.
--
-- Net effect is a strict improvement: anon can no longer call
-- property_account() via /rest/v1/rpc, which previously returned any
-- property's owning host_account_id with no auth check.
--
-- Verified safe before applying: a repo-wide grep found ZERO anon-role reads of
-- public tables. No createBrowserClient usage exists; every guest route
-- (app/g, app/stay, app/answer, lib/guest) uses createAdminClient (service
-- role, bypasses RLS); middleware only calls auth.getUser() against the auth
-- schema; and legal_documents is read by no code (lib/legal/registry.ts is
-- file-based).

do $$
declare
  r record;
begin
  for r in
    select c.relname as tbl, p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polroles = '{0}'
    order by 1, 2
  loop
    execute format('alter policy %I on public.%I to authenticated', r.polname, r.tbl);
    raise notice 'scoped policy %.% to authenticated', r.tbl, r.polname;
  end loop;
end $$;

revoke execute on function public.property_account(uuid) from public, anon;
grant execute on function public.property_account(uuid) to authenticated, service_role;

revoke execute on function public.can_access_property(uuid) from public, anon;
grant execute on function public.can_access_property(uuid) to authenticated, service_role;

revoke execute on function public.can_edit_property(uuid) from public, anon;
grant execute on function public.can_edit_property(uuid) to authenticated, service_role;

revoke execute on function public.is_account_member(uuid) from public, anon;
grant execute on function public.is_account_member(uuid) to authenticated, service_role;

revoke execute on function public.is_account_owner(uuid) from public, anon;
grant execute on function public.is_account_owner(uuid) to authenticated, service_role;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
