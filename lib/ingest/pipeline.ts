import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAIProvider } from '@/lib/ai';
import { chunkText } from '@/lib/ingest/chunk';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { logAiUsage } from '@/lib/ai/usage';
import { ensureIngestionSource, recordManualSource } from '@/lib/acquisition/audit';

type Client = SupabaseClient<Database>;
type BrainCategory = Database['public']['Enums']['brain_category'];
type Visibility = Database['public']['Enums']['brain_visibility'];
type SourceType = Database['public']['Enums']['source_type'];
type IngestionKind = Database['public']['Enums']['ingestion_kind'];

export interface IngestInput {
  propertyId: string;
  title: string;
  text: string;
  category: BrainCategory;
  visibility: Visibility;
  sourceType: SourceType;
  kind: IngestionKind;
  sourceUrl?: string | null;
  documentId?: string | null;
  createdBy?: string | null;
}

export interface IngestResult {
  brainItemId: string;
  chunks: number;
  title: string;
}

// Shared ingestion pipeline: brain_item -> chunk -> embed -> document_chunks.
// Property isolation is enforced by stamping property_id on every row; retrieval
// only ever happens through match_property_chunks(p_property_id, ...).
// Untrusted content (docs/URLs) is stored as reference DATA only.
export async function ingestText(client: Client, input: IngestInput): Promise<IngestResult> {
  const provider = getAIProvider();

  // The pipeline is called only for a host edit or an approved proposal. Record the
  // source copy independently from Brain rows so the original reference remains auditable.
  const sourceId = await ensureIngestionSource(client, {
    propertyId: input.propertyId, kind: input.documentId ? 'document' : input.sourceUrl ? 'listing' : 'manual_site',
    url: input.sourceUrl ?? null, documentId: input.documentId ?? null, profile: 'approved_pipeline_v1',
    label: input.title, createdBy: input.createdBy ?? null,
  });
  await recordManualSource(client, {
    propertyId: input.propertyId, sourceId, profile: 'approved_pipeline_v1', title: input.title, text: input.text, provider: 'approved-pipeline',
  });

  // 1. Create the brain item in a processing state.
  const { data: item, error: itemErr } = await client
    .from('brain_items')
    .insert({
      property_id: input.propertyId,
      title: input.title.slice(0, 200),
      body: input.text.slice(0, 20000),
      category: input.category,
      visibility: input.visibility,
      source_type: input.sourceType,
      status: 'processing',
      created_by: input.createdBy ?? null,
    } as never)
    .select('id')
    .single();
  if (itemErr || !item) {
    throw new Error('Could not create the knowledge item.');
  }
  const brainItemId = (item as { id: string }).id;

  // 2. Record an ingestion job for observability/retries.
  const { data: job } = await client
    .from('ingestion_jobs')
    .insert({
      property_id: input.propertyId,
      kind: input.kind,
      status: 'processing',
      source_url: input.sourceUrl ?? null,
      document_id: input.documentId ?? null,
      created_by: input.createdBy ?? null,
    } as never)
    .select('id')
    .single();
  const jobId = (job as { id: string } | null)?.id ?? null;

  try {
    // 3. Chunk + embed.
    const chunks = chunkText(input.text);
    if (chunks.length === 0) throw new Error('No content to index.');
    const embedStart = Date.now();
    let embeddings: number[][];
    let embedModel = provider.embedModel;
    let embedTokens = 0;
    if (provider.embedWithUsage) {
      const r = await provider.embedWithUsage(chunks);
      embeddings = r.vectors;
      embedModel = r.model;
      embedTokens = r.totalTokens;
    } else {
      embeddings = await provider.embed(chunks);
    }
    // Fire-and-forget ingest embedding cost telemetry.
    void logAiUsage(createAdminClient(), {
      propertyId: input.propertyId,
      kind: 'ingest',
      model: embedModel,
      embedTokens,
      latencyMs: Date.now() - embedStart,
      source: 'ingest',
    });

    // 4. Insert chunk rows (property-scoped, visibility-scoped).
    const rows = chunks.map((content, i) => ({
      property_id: input.propertyId,
      brain_item_id: brainItemId,
      document_id: input.documentId ?? null,
      content,
      token_count: Math.ceil(content.length / 4),
      chunk_index: i,
      embedding: JSON.stringify(embeddings[i]),
      category: input.category,
      visibility: input.visibility,
    }));
    // document_chunks has no host-side INSERT RLS policy (embeddings are a
    // server-controlled artifact, never written directly by the browser). Use the
    // service-role client for this trusted write — property isolation is already
    // enforced upstream by the route's getPropertyAccess guard and every row is
    // stamped with property_id. Retrieval still only happens via match_property_chunks.
    const admin = createAdminClient();
    const { error: chunkErr } = await admin.from('document_chunks').insert(rows as never);
    if (chunkErr) throw new Error(chunkErr.message);

    // 5. Mark ready.
    await client.from('brain_items').update({ status: 'ready' } as never).eq('id', brainItemId);
    if (jobId) {
      await client.from('ingestion_jobs').update({ status: 'ready', result: { chunks: chunks.length } as never } as never).eq('id', jobId);
    }

    return { brainItemId, chunks: chunks.length, title: input.title };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ingestion failed.';
    log.warn('ingest_failed', { propertyId: input.propertyId, brainItemId, error: msg });
    await client.from('brain_items').update({ status: 'failed', ingestion_error: msg.slice(0, 500) } as never).eq('id', brainItemId);
    if (jobId) {
      await client.from('ingestion_jobs').update({ status: 'failed', last_error: msg.slice(0, 500) } as never).eq('id', jobId);
    }
    throw new Error(msg);
  }
}
