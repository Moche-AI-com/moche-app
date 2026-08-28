-- P0 security hardening. Archival copy: supabase-migrations-P0-SECURITY.sql
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

revoke execute on function public.property_account(uuid) from anon;
revoke execute on function public.can_access_property(uuid) from anon;
revoke execute on function public.can_edit_property(uuid) from anon;
revoke execute on function public.is_account_member(uuid) from anon;
revoke execute on function public.is_account_owner(uuid) from anon;
revoke execute on function public.is_admin() from anon;

comment on table public.app_settings is
  'Service-role only. RLS enabled with NO policies on purpose: deny-all for anon/authenticated. Do not add policies - see supabase-migrations-P0-SECURITY.sql section 5.';

comment on table public.host_otp_challenges is
  'Service-role only. RLS enabled with NO policies on purpose: deny-all for anon/authenticated. Do not add policies - see supabase-migrations-P0-SECURITY.sql section 5.';
