-- ---------------------------------------------------------------------------
-- P0 — Security hardening + version-control reconciliation
--
-- Applied to project sqpdzhannyskdiyuarhp on 2026-08-05 as four sequential
-- migrations (p0_security_hardening, p0_security_hardening_helper_grants,
-- p0_scope_policies_to_authenticated,
-- p0_move_property_account_to_private_schema). This file is the repo-tracked
-- archival copy, following the flat-file convention established by
-- supabase-migrations-RBAC.sql.
--
-- It is written to be idempotent and safe to re-run.
--
--
-- WHY THIS FILE EXISTS
-- ====================
-- A grounded audit of the LIVE database found the live GRANT state had already
-- diverged from what git tracks:
--
--   * match_property_knowledge  -> anon/authenticated EXECUTE was ALREADY
--                                  revoked live, but NO revoke statement
--                                  existed in any tracked .sql file.
--   * match_property_chunks     -> same, and the function definition itself was
--                                  never archived at all; it existed only as a
--                                  generated TypeScript type.
--   * bump_brain_version        -> same, already revoked live, never tracked.
--
-- That is silent drift. The live database happened to be safe, but nothing in
-- version control prevented a future `create or replace` from re-granting
-- EXECUTE to PUBLIC (Postgres grants EXECUTE to PUBLIC by default on CREATE
-- FUNCTION). This file makes the safe state explicit, idempotent, reviewable,
-- and regression-proof.
--
--
-- ONE THING THAT WENT WRONG, RECORDED SO IT IS NOT REPEATED
-- =========================================================
-- The first attempt ran `revoke execute on function ... from anon`. It had NO
-- effect: anon's EXECUTE privilege came from the implicit PUBLIC grant, not
-- from a direct grant to anon, and revoking from a role does not remove a
-- PUBLIC grant. The correct form is `revoke ... from public` followed by an
-- explicit `grant ... to` the roles that genuinely need it.
--
-- The second attempt then broke anon reads: with EXECUTE revoked, an anon
-- SELECT on `properties` returned
--   ERROR: 42501 permission denied for function is_account_member
-- instead of zero rows, because Postgres evaluates a policy expression as the
-- querying role. This was caught by a regression test before shipping, and is
-- why section 3 below scopes the policies BEFORE section 4 revokes.
--
--
-- VERIFICATION EVIDENCE (all re-runnable; see section 6)
-- ======================================================
--   public.property_account removed .................. 0 (expected 0)
--   private.property_account exists .................. 1 (expected 1)
--   anon EXECUTE private.property_account ............ false
--   anon EXECUTE on all 5 public helpers ............. false
--   anon SELECT public.properties .................... 0 rows, NO error
--   authenticated owner SELECT properties ............ 2 rows
--   service_role match_property_knowledge ............ 1 row  (guard passes)
--   service_role match_property_chunks ............... 6 rows (guard passes)
--   policies still scoped to PUBLIC .................. 0 (was 45)
--   Supabase security advisor anon_security_definer_* . 6 WARNs -> 0
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. match_property_knowledge — internal authorization guard
--
-- Language changes sql -> plpgsql so the guard can raise. Signature and return
-- type are unchanged, so `create or replace` suffices and no dependent object
-- is invalidated.
--
-- The guard must NOT break the one legitimate caller: the guest concierge
-- reaches this RPC through createAdminClient() (service-role key). PostgREST
-- executes service-role requests as `service_role`, so that role passes
-- unconditionally. Every other role must satisfy can_access_property(), which
-- is auth.uid()-scoped and therefore fails closed for anon.
--
-- This is defense in depth, not the primary control. The primary control is
-- the REVOKE in section 4. The guard exists so that a future accidental
-- re-grant is not by itself sufficient to leak another property's Brain,
-- mirroring the belt-and-braces pattern already used for profiles.is_admin
-- (column REVOKE plus a BEFORE UPDATE trigger) in supabase-migrations-RBAC.sql.
-- ===========================================================================
create or replace function public.match_property_knowledge(
  p_property_id uuid,
  p_query_embedding vector(1536),
  p_node_types text[] default null,
  p_match_count integer default 4
)
returns table (
  id uuid,
  property_id uuid,
  node_type text,
  title text,
  data jsonb,
  content text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin')
     and not public.can_access_property(p_property_id) then
    raise exception 'not authorized for property %', p_property_id
      using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.property_id,
    n.node_type,
    n.title,
    n.data,
    n.content,
    1 - (n.embedding <=> p_query_embedding) as similarity
  from public.property_knowledge_nodes n
  where n.property_id = p_property_id
    and n.embedding is not null
    and (p_node_types is null or n.node_type = any (p_node_types))
  order by n.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 4), 1);
end;
$$;


-- ===========================================================================
-- 2. match_property_chunks — archive the live definition + same guard
--
-- This function had NEVER been under version control. The pre-existing live
-- definition, captured via pg_get_functiondef before modification, was:
--
--   language sql stable security definer set search_path = public, extensions
--   select c.id, c.brain_item_id, c.document_id, c.category, c.content,
--          1 - (c.embedding <=> p_query_embedding) as similarity
--   from document_chunks c
--   where c.property_id = p_property_id
--     and c.embedding is not null
--     and (not p_guest_only or c.visibility = 'guest')
--   order by c.embedding <=> p_query_embedding
--   limit p_match_count;
--
-- Live grants at capture time: anon EXECUTE false, authenticated EXECUTE false.
-- The query logic below is byte-equivalent apart from the added guard and a
-- defensive `greatest(coalesce(...), 1)` on the LIMIT.
-- ===========================================================================
create or replace function public.match_property_chunks(
  p_property_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 6,
  p_guest_only boolean default true
)
returns table (
  id uuid,
  brain_item_id uuid,
  document_id uuid,
  category brain_category,
  content text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin')
     and not public.can_access_property(p_property_id) then
    raise exception 'not authorized for property %', p_property_id
      using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.brain_item_id,
    c.document_id,
    c.category,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.document_chunks c
  where c.property_id = p_property_id
    and c.embedding is not null
    and (not p_guest_only or c.visibility = 'guest')
  order by c.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 6), 1);
end;
$$;


-- ===========================================================================
-- 3. Scope incidentally-PUBLIC RLS policies to `authenticated`
--
-- 45 policies in the public schema were created with no TO clause, so they
-- applied to PUBLIC — every role, anon included. Every one of them is
-- auth.uid()-scoped, so anon could never actually match a row; the PUBLIC
-- scope was incidental, not intentional.
--
-- Scoping them to `authenticated` is a strict improvement on its own, and it is
-- a PREREQUISITE for section 4: with no matching policy, anon never causes the
-- helper functions to be evaluated, so revoking anon's EXECUTE yields a clean
-- "0 rows" instead of "permission denied for function".
--
-- Verified safe before applying: a repo-wide grep found ZERO anon-role reads of
-- public tables. There is no createBrowserClient usage anywhere in the app;
-- every guest route (app/g, app/stay, app/answer, lib/guest) uses
-- createAdminClient (service role, which bypasses RLS); middleware only calls
-- auth.getUser() against the auth schema; and legal_documents is read by no
-- code at all, because lib/legal/registry.ts is file-based.
--
-- Written as a loop rather than 45 hand-written ALTER POLICY statements so that
-- it stays correct if a policy is renamed, and so re-running it is a no-op.
-- ===========================================================================
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
      and p.polroles = '{0}'   -- '{0}' is PUBLIC (all roles)
    order by 1, 2
  loop
    execute format('alter policy %I on public.%I to authenticated', r.polname, r.tbl);
    raise notice 'scoped policy %.% to authenticated', r.tbl, r.polname;
  end loop;
end $$;


-- ===========================================================================
-- 4. Make the EXECUTE grants explicit and tracked
--
-- `create or replace function` in sections 1-2 re-grants EXECUTE to PUBLIC, so
-- these REVOKEs are not documentation — they are load-bearing and must run
-- after those definitions.
--
-- Note the `from public` (not `from anon`): see the "ONE THING THAT WENT WRONG"
-- note in the header.
-- ===========================================================================

-- Vector search + brain versioning: service_role only. These are called
-- exclusively from server-side admin clients, never from the browser.
revoke execute on function public.match_property_knowledge(uuid, vector, text[], integer)
  from public, anon, authenticated;
grant execute on function public.match_property_knowledge(uuid, vector, text[], integer)
  to service_role;

revoke execute on function public.match_property_chunks(uuid, vector, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.match_property_chunks(uuid, vector, integer, boolean)
  to service_role;

revoke execute on function public.bump_brain_version(uuid)
  from public, anon, authenticated;
grant execute on function public.bump_brain_version(uuid)
  to service_role;

-- RLS helper predicates: authenticated (required — an RLS policy that calls a
-- function the querying role cannot execute raises permission denied instead of
-- returning zero rows) and service_role. Never anon.
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


-- ===========================================================================
-- 5. property_account(uuid) — move out of the PostgREST-exposed schema
--
-- Definition is `select host_account_id from properties where id = prop`,
-- SECURITY DEFINER, with no auth check. Revoking anon EXECUTE (section 4)
-- closed the unauthenticated hole, but it was still callable by ANY signed-in
-- user via /rest/v1/rpc/property_account, letting them map an arbitrary
-- property_id to its owning host_account_id. That is a cross-tenant
-- association leak.
--
-- Revoking from `authenticated` is not an option, because an RLS policy calls
-- it. The correct fix for "policies need it, the API must not expose it" is to
-- move it to a schema outside the exposed API schema list. PostgREST exposes
-- only `public` (and graphql_public) for this project, so private.* is
-- reachable from policy expressions while having no REST surface.
--
-- Contained change: exactly ONE policy references it
-- (property_members.propmembers_write) and ZERO TypeScript call sites do —
-- lib/database.types.ts merely declared the type, it was never invoked.
-- Verified by repo-wide grep before applying.
--
-- The five boolean helpers in section 4 are deliberately LEFT in public. They
-- are referenced by policies across many tracked migration files, and unlike
-- property_account they return only self-scoped booleans about the caller's own
-- access, so an authenticated user calling them directly learns nothing they
-- could not already determine from their own queries. The residual
-- authenticated_security_definer_function_executable linter WARNs for those are
-- knowingly accepted; moving them to private is a tracked follow-up, not a
-- launch blocker.
-- ===========================================================================
create schema if not exists private;

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

alter policy propmembers_write on public.property_members
  using (public.is_account_owner(private.property_account(property_id)))
  with check (public.is_account_owner(private.property_account(property_id)));

drop function if exists public.property_account(uuid);


-- ===========================================================================
-- 6. app_settings / host_otp_challenges — deliberately policy-less
--
-- The Supabase linter reports rls_enabled_no_policy (INFO) for both. This is
-- INTENTIONAL and must not be "fixed" by adding policies. Both are
-- service-role-only by design: app_settings holds the master system prompt,
-- host_otp_challenges holds hashed 2FA challenges. RLS enabled with zero
-- policies is deny-all for anon and authenticated, which is exactly correct.
--
-- Recorded as a COMMENT so the decision travels with the schema and the next
-- person to read the linter output does not undo it.
-- ===========================================================================
comment on table public.app_settings is
  'Service-role only. RLS enabled with NO policies on purpose: deny-all for anon/authenticated. Do not add policies - see supabase-migrations-P0-SECURITY.sql section 6.';

comment on table public.host_otp_challenges is
  'Service-role only. RLS enabled with NO policies on purpose: deny-all for anon/authenticated. Do not add policies - see supabase-migrations-P0-SECURITY.sql section 6.';


-- ===========================================================================
-- 7. Re-runnable verification
--
-- Run this block after any change touching RLS, SECURITY DEFINER functions, or
-- function grants. Every row should match its stated expectation.
-- ===========================================================================
-- select 'anon EXECUTE (all expect false)' as check, p.proname,
--        has_function_privilege('anon', p.oid, 'execute') as anon_execute
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef
-- order by 2;
--
-- select 'policies still scoped to PUBLIC (expect 0)' as check, count(*)
-- from pg_policy p join pg_class c on c.oid = p.polrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and p.polroles = '{0}';
