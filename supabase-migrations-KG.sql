-- ============================================================================
-- Property Knowledge Graph (POC) — additive, non-destructive migration.
-- Safe to run repeatedly (IF NOT EXISTS / CREATE OR REPLACE throughout).
--
-- Adds ONLY:
--   1. property_knowledge_nodes  — normalized, structured knowledge nodes
--                                  (POC scope: node_type in wifi/checkin/checkout).
--   2. unique + vector indexes.
--   3. RLS + a host-side read policy (writes stay server-role only).
--   4. match_property_knowledge(...) — property-scoped vector search RPC that
--      mirrors match_property_chunks (isolation enforced IN THE DATABASE).
--
-- Does NOT alter/drop document_chunks, brain_items, properties, or any enum.
-- Embeddings stay 1536-dim (text-embedding-3-small / EMBED_DIM) — vector(1536).
-- Requires the `vector` extension, which is already installed (document_chunks
-- uses vector(1536) today); we do not create or alter it here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalized knowledge nodes. One row per (property, node_type, title).
--    `data` holds the validated structured payload; `content` is the canonical
--    text that was embedded and is also what we surface to the concierge.
-- ---------------------------------------------------------------------------
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

-- Upsert target: one node per property + type + title.
create unique index if not exists property_knowledge_nodes_ptt_uidx
  on public.property_knowledge_nodes (property_id, node_type, title);

-- Fast property-scoped filtering.
create index if not exists property_knowledge_nodes_property_idx
  on public.property_knowledge_nodes (property_id);

-- ANN index for cosine similarity search (mirrors the document_chunks approach).
create index if not exists property_knowledge_nodes_embedding_idx
  on public.property_knowledge_nodes using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- 2. RLS. Writes are performed exclusively by the service role (which bypasses
--    RLS), mirroring document_chunks / answer_cache. We add a read-only policy
--    so authenticated hosts can inspect their own property's nodes; no write
--    policy exists, so the browser can never mutate embeddings directly.
-- ---------------------------------------------------------------------------
alter table public.property_knowledge_nodes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'property_knowledge_nodes'
      and policyname = 'property_knowledge_nodes_select_members'
  ) then
    create policy property_knowledge_nodes_select_members
      on public.property_knowledge_nodes
      for select
      using (public.can_access_property(property_id));
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. Vector search RPC. SECURITY DEFINER + explicit p_property_id filter so a
--    caller can only ever retrieve nodes for the property it names — exactly
--    like match_property_chunks. p_node_types optionally narrows to the node
--    types relevant to the guest's question (NULL = all types).
-- ---------------------------------------------------------------------------
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
language sql
stable
security definer
set search_path = public, extensions
as $$
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
$$;
