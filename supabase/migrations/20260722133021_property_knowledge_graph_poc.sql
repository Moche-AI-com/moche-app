create table if not exists public.property_knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  node_type text not null,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  content text not null,
  embedding vector(1536),
  source_brain_item_id uuid references public.brain_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists property_knowledge_nodes_ptt_uidx on public.property_knowledge_nodes (property_id, node_type, title);
create index if not exists property_knowledge_nodes_property_idx on public.property_knowledge_nodes (property_id);
create index if not exists property_knowledge_nodes_embedding_idx on public.property_knowledge_nodes using ivfflat (embedding vector_cosine_ops) with (lists = 100);
alter table public.property_knowledge_nodes enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'property_knowledge_nodes' and policyname = 'property_knowledge_nodes_select_members'
  ) then
    create policy property_knowledge_nodes_select_members on public.property_knowledge_nodes for select using (public.can_access_property(property_id));
  end if;
end$$;
create or replace function public.match_property_knowledge(
  p_property_id uuid,
  p_query_embedding vector(1536),
  p_node_types text[] default null,
  p_match_count integer default 4
)
returns table (id uuid, property_id uuid, node_type text, title text, data jsonb, content text, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select n.id, n.property_id, n.node_type, n.title, n.data, n.content, 1 - (n.embedding <=> p_query_embedding) as similarity
  from public.property_knowledge_nodes n
  where n.property_id = p_property_id and n.embedding is not null and (p_node_types is null or n.node_type = any (p_node_types))
  order by n.embedding <=> p_query_embedding
  limit greatest(coalesce(p_match_count, 4), 1);
$$;
