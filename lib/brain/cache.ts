import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

// Normalize a question for exact-match caching: lowercase, trim, collapse internal
// whitespace, and strip trailing punctuation/whitespace. Two questions that differ
// only by casing/spacing/"?" therefore share a cache row.
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\s?!.]+$/g, '')
    .trim();
}

// Current Brain version for a property. No row == version 1 (implicit baseline).
export async function getBrainVersion(admin: Admin, propertyId: string): Promise<number> {
  const { data, error } = await admin
    .from('property_brain_versions')
    .select('version')
    .eq('property_id', propertyId)
    .maybeSingle();
  if (error) {
    log.warn('brain_version_read_failed', { propertyId, error: error.message });
    return 1;
  }
  return data?.version ?? 1;
}

// Bump the property's Brain version (invalidates all cached answers logically) and
// clear its cache rows so the table stays small. Never throws into the caller path —
// invalidation failing must not break the Brain-mutating action that triggered it.
export async function bumpBrainVersion(admin: Admin, propertyId: string): Promise<void> {
  try {
    const { error } = await admin.rpc('bump_brain_version', { p_property_id: propertyId });
    if (error) log.warn('brain_version_bump_failed', { propertyId, error: error.message });
    // Trivial extra cleanup: stale rows would never match the new version anyway, but
    // dropping them keeps the cache table from accumulating dead entries.
    await admin.from('answer_cache').delete().eq('property_id', propertyId);
  } catch (e) {
    log.warn('brain_version_bump_threw', { propertyId, error: String(e) });
  }
}

export interface CachedAnswer {
  answer: string;
  confidence: number;
}

// Exact-match lookup. Returns null on miss OR when the cached row was written against
// a superseded Brain version (defense-in-depth alongside the bump-time delete).
export async function lookupCachedAnswer(
  admin: Admin,
  propertyId: string,
  questionNorm: string,
  brainVersion: number,
): Promise<CachedAnswer | null> {
  const { data, error } = await admin
    .from('answer_cache')
    .select('answer, confidence, brain_version')
    .eq('property_id', propertyId)
    .eq('question_norm', questionNorm)
    .maybeSingle();
  if (error || !data) return null;
  if (data.brain_version !== brainVersion) return null;
  return { answer: data.answer, confidence: Number(data.confidence) };
}

// Upsert a high-confidence answer against the current Brain version. Fire-and-forget:
// telemetry/caching must never slow or fail the guest response.
export async function cacheAnswer(
  admin: Admin,
  input: { propertyId: string; questionNorm: string; answer: string; confidence: number; brainVersion: number },
): Promise<void> {
  try {
    const { error } = await admin
      .from('answer_cache')
      .upsert(
        {
          property_id: input.propertyId,
          question_norm: input.questionNorm,
          answer: input.answer,
          confidence: input.confidence,
          brain_version: input.brainVersion,
        },
        { onConflict: 'property_id,question_norm' },
      );
    if (error) log.warn('answer_cache_write_failed', { propertyId: input.propertyId, error: error.message });
  } catch (e) {
    log.warn('answer_cache_write_threw', { propertyId: input.propertyId, error: String(e) });
  }
}
