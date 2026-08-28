-- Property-isolated vector retrieval. property filter is in the query itself.
create or replace function match_property_chunks(
  p_property_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 6,
  p_guest_only boolean default true
)
returns table (
  id uuid,
  brain_item_id uuid,
  document_id uuid,
  category brain_category,
  content text,
  similarity float
)
language sql stable security definer set search_path = public as $$
  select c.id, c.brain_item_id, c.document_id, c.category, c.content,
         1 - (c.embedding <=> p_query_embedding) as similarity
  from document_chunks c
  where c.property_id = p_property_id
    and c.embedding is not null
    and (not p_guest_only or c.visibility = 'guest')
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke all on function match_property_chunks(uuid, vector, int, boolean) from public, anon, authenticated;
