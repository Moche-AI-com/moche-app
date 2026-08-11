import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { AcquisitionAttempt, AcquisitionContext, AcquisitionResult } from './types';

type Admin = SupabaseClient<Database>;
type SourceKind = 'property_site' | 'listing' | 'manual_site' | 'local_source' | 'document';

export async function ensureIngestionSource(admin: Admin, input: {
  propertyId: string; kind: SourceKind; url?: string | null; documentId?: string | null;
  profile: string; label: string; createdBy?: string | null;
}): Promise<string | null> {
  if (input.url) {
    const { data } = await admin.from('ingestion_sources').select('id').eq('property_id', input.propertyId).eq('url', input.url).maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  const { data, error } = await admin.from('ingestion_sources').insert({
    property_id: input.propertyId, kind: input.kind, url: input.url ?? null, document_id: input.documentId ?? null,
    profile: input.profile, label: input.label.slice(0, 200), created_by: input.createdBy ?? null,
  } as never).select('id').single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

function similarity(left: string, right: string): number {
  const tokens = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0; for (const token of a) if (b.has(token)) overlap++;
  return overlap / new Set([...a, ...b]).size;
}

export function acquisitionAuditContext(admin: Admin, input: { propertyId: string; sourceId?: string | null; profile: string }): AcquisitionContext {
  let primaryText: string | null = null;
  return {
    onAttempt: async (attempt: AcquisitionAttempt) => {
      const result = attempt.result;
      const score = attempt.isShadow && result && primaryText ? similarity(primaryText, result.text) : null;
      const { data: artifact } = await admin.from('ingestion_artifacts').insert({
        property_id: input.propertyId, source_id: input.sourceId ?? null, provider: attempt.provider, profile: input.profile,
        http_status: result?.httpStatus ?? attempt.httpStatus ?? null, byte_length: result?.byteLength ?? null,
        text_length: result?.text.length ?? 0, content_sha256: result ? createHash('sha256').update(result.text).digest('hex') : null,
        truncated: result?.truncated ?? false, is_shadow: attempt.isShadow, error_reason: attempt.errorReason ?? null,
        latency_ms: attempt.latencyMs, similarity_score: score, agrees_with_primary: score === null ? null : score >= 0.65,
      } as never).select('id').single();
      if (result && artifact && !attempt.isShadow) {
        primaryText = result.text;
        await admin.from('ingestion_sources').update({ last_acquired_at: new Date().toISOString(), last_status: 'ready' } as never).eq('id', input.sourceId ?? '');
        // Untrusted reference data only. It is deliberately separate from guest-facing Brain content.
        await admin.from('source_documents').insert({
          property_id: input.propertyId, artifact_id: (artifact as { id: string }).id, title: result.title.slice(0, 300),
          text: result.text.slice(0, 200_000), text_sha256: createHash('sha256').update(result.text).digest('hex'), language: null,
        } as never);
      } else if (!result && input.sourceId) {
        await admin.from('ingestion_sources').update({ last_status: attempt.errorReason ?? 'failed' } as never).eq('id', input.sourceId);
      }
    },
  };
}

export async function recordManualSource(admin: Admin, input: {
  propertyId: string; sourceId?: string | null; profile: string; title: string; text: string; provider: string;
}): Promise<void> {
  await acquisitionAuditContext(admin, input).onAttempt?.({
    provider: input.provider,
    result: { title: input.title, text: input.text, sourceUrl: '', finalUrl: '', contentType: 'text/plain', byteLength: Buffer.byteLength(input.text), providerName: input.provider, httpStatus: 200, truncated: false },
    latencyMs: 0, isShadow: false,
  });
}
