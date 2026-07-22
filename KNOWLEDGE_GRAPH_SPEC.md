# Property Knowledge Graph — Implementation Spec (POC)

## Goal
Add an authoritative, structured "knowledge graph" layer on top of the existing
chunk/RAG retrieval so the concierge answers high-value factual questions (WiFi,
Check-in, Check-out) from a PINNED source-of-truth instead of guessing from
semantic chunks. This is the anti-hallucination win.

## HARD CONSTRAINTS (do not violate)
- **Embeddings stay 1536-dim (OpenAI, `text-embedding-3-small`).** Reuse the existing
  `getAIProvider()` / `EMBED_DIM = 1536` from `lib/ai/provider.ts`. Do NOT introduce
  BGE-384 or alter any existing `vector(1536)` column. The new graph table's embedding
  column MUST be `vector(1536)`.
- **No destructive DB changes.** Only ADD a new table + indexes + one new RPC. Do not
  alter or drop `document_chunks`, `brain_items`, or any existing object. Migration must
  be idempotent (`create table if not exists`, `create index if not exists`).
- **No new always-on infra.** Runs entirely on Vercel serverless + Supabase + the
  existing OpenAI provider. No Ollama/FastEmbed/Docling sidecars in this pass.
- Property isolation must be enforced IN THE DATABASE exactly like `match_property_chunks`
  — the new RPC filters by `p_property_id` server-side; never retrieve globally then filter.
- Follow existing code conventions: `server-only` imports, zod validation, structured
  logging via the existing `log` util, provider abstraction (never call OpenAI SDK directly
  outside `lib/ai/`).

## Categories for this POC
Only three, mapped to the existing `brain_category` enum:
- `wifi`  (maps to enum `core`)
- `checkin` (maps to enum `checkin_checkout`)
- `checkout` (maps to enum `checkin_checkout`)

## Phase A — Supabase migration (additive only)
Create `supabase/migrations/<timestamp>_property_knowledge_nodes.sql`:

```sql
create table if not exists property_knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  node_type text not null,               -- 'wifi' | 'checkin' | 'checkout'
  title text not null default '',
  data jsonb not null,                   -- normalized, validated JSON blob
  embedding vector(1536),                -- SAME dim as document_chunks
  source text,                           -- 'brain_item' | 'manual' | 'crawl'
  brain_item_id uuid references brain_items(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists property_knowledge_nodes_unique
  on property_knowledge_nodes (property_id, node_type, title);

create index if not exists property_knowledge_nodes_property
  on property_knowledge_nodes (property_id);

-- RLS: host can read own property's nodes; writes go through service role (like document_chunks).
alter table property_knowledge_nodes enable row level security;

create policy "host reads own knowledge nodes" on property_knowledge_nodes
  for select using (
    exists (select 1 from properties p
            where p.id = property_knowledge_nodes.property_id
              and p.owner_id = auth.uid())
  );
```

Also add a retrieval RPC that returns the pinned node(s) for a property + node_types:

```sql
create or replace function match_property_knowledge(
  p_property_id uuid,
  p_node_types text[]
)
returns table (id uuid, node_type text, title text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, node_type, title, data, updated_at
  from property_knowledge_nodes
  where property_id = p_property_id
    and node_type = any(p_node_types)
  order by updated_at desc;
$$;
```

After writing the migration, regenerate `lib/database.types.ts` if the project has a
typegen script (check package.json). If not, hand-extend the types minimally.

## Phase B — Normalizer (`lib/normalizer/`)
- `schemas.ts`: zod schemas + typed prompts per node_type. Each prompt instructs the model
  to return ONLY valid JSON matching the schema. Example shapes:
  - wifi: `{ node_type:'wifi', ssid:string, password:string, notes?:string }`
  - checkin: `{ node_type:'checkin', time?:string, method?:string, steps:string[] }`
  - checkout: `{ node_type:'checkout', time?:string, tasks:string[] }`
- `normalize.ts`: `normalizeToNode(text, nodeType)` →
  1. route through `routedCompletion` (Phase D) with the typed prompt,
  2. `JSON.parse` + zod `.safeParse`,
  3. on failure, retry ONCE via the high-tier model (GPT-4o) fallback,
  4. return validated object or `null` (caller logs + skips — never store invalid).

## Phase C — Wire normalizer into ingest
In `lib/ingest/pipeline.ts` (or the brain reindex path in
`app/dashboard/properties/[id]/brain/actions.ts`): after a brain_item in a POC category is
saved/reindexed, additionally run the normalizer for the matching node_type, embed the
node's canonical string (e.g. `"WiFi network X, password Y"`) with the 1536 provider, and
UPSERT into `property_knowledge_nodes` (onConflict property_id,node_type,title). This gives
the "update in one place" guarantee. Keep this best-effort/non-blocking so a normalizer
failure never breaks normal ingest.

## Phase D — Hybrid routing (`lib/router/modelRouter.ts`)
- `classifyTask(taskType)` → 'low' | 'medium' | 'high'.
- `routedCompletion(messages, taskType)`:
  - If `OPENROUTER_API_KEY` is set AND task is low/medium → call OpenRouter (env
    `OPENROUTER_MODEL`, default `google/gemini-flash-1.5`).
  - Otherwise → existing `getAIProvider().generate()` (OpenAI). This is the DEFAULT today
    (no OpenRouter key set), so behavior is unchanged until the key is added.
- Add a `redactPII(text)` util and apply it to any text sent to OpenRouter (external).
- All new env vars go through `lib/env.ts` with safe defaults; document them.

## Phase E — Dual-query in concierge
In `lib/guest/concierge.ts` `answerGuestQuestion`:
1. Classify the question to candidate node_types (simple keyword map: wifi/checkin/checkout).
2. If any match, call `match_property_knowledge(propertyId, nodeTypes)` FIRST.
3. Build the synthesis prompt with graph nodes labeled `AUTHORITATIVE SOURCE OF TRUTH`
   and the existing chunks labeled `SUPPORTING CONTEXT`.
4. If a graph node directly answers (e.g. wifi node present for a wifi question), the model
   must use it verbatim and confidence should be high.
5. Preserve existing behavior fully when no node matches (fall back to chunks-only path).
6. Keep the emergency path, answer cache, and usage logging intact.

## Verification (must pass before PR)
- `npx tsc --noEmit` exits 0.
- `npx next build` exits 0.
- Migration is additive & idempotent (re-runnable).
- Existing chunks-only concierge path unchanged when no node exists.
- Add a short note to the PR describing how to enable OpenRouter later (set env vars).

## Deliverable
Open a PR from branch `feature/knowledge-graph` against `main`. Do NOT deploy to prod —
the main agent handles deploy after review.
