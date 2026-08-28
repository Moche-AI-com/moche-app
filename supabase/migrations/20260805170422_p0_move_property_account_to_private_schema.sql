-- P0: move property_account() out of the PostgREST-exposed schema.
--
-- WHY:
-- Revoking anon EXECUTE (previous migration) closed the unauthenticated leak,
-- but property_account() was still callable by any signed-in user via
-- /rest/v1/rpc/property_account. It is SECURITY DEFINER with no auth check and
-- returns `select host_account_id from properties where id = prop`, so ANY
-- authenticated user could map an arbitrary property_id to its owning
-- host_account_id. That is a cross-tenant association leak, not just an anon
-- one, and revoking EXECUTE from `authenticated` is not an option because an
-- RLS policy calls it.
--
-- The Supabase-recommended fix for a helper that policies need but the API must
-- not expose is to move it to a schema that is not in the exposed API schema
-- list. PostgREST only exposes `public` (and graphql_public) for this project,
-- so `private.property_account` is reachable from RLS policy expressions but
-- has no REST surface at all.
--
-- Contained change: exactly ONE policy references it
-- (property_members.propmembers_write) and ZERO TypeScript call sites do -
-- lib/database.types.ts only declares the type, it is never invoked. Verified
-- by repo-wide grep before applying.
--
-- The five boolean helpers (can_access_property, can_edit_property,
-- is_account_member, is_account_owner, is_admin) are deliberately LEFT in
-- public. They are referenced by policies across many tracked migration files
-- and, unlike property_account, they return only self-scoped booleans about the
-- caller's own access - an authenticated user calling them directly learns
-- nothing they cannot already determine from their own queries. The residual
-- linter WARNs for those six are accepted, documented, and revisitable.

create schema if not exists private;

-- No role should be able to browse this schema; grant usage narrowly.
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.property_account(prop uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select host_account_id from public.properties where id = prop;
$$;

revoke execute on function private.property_account(uuid) from public, anon;
grant execute on function private.property_account(uuid) to authenticated, service_role;

-- Repoint the single dependent policy, then drop the exposed copy.
alter policy propmembers_write on public.property_members
  using (public.is_account_owner(private.property_account(property_id)))
  with check (public.is_account_owner(private.property_account(property_id)));

drop function public.property_account(uuid);
