import 'server-only';

// Initial setup is the one deliberate exception to the draft-then-approve
// workflow. An empty Brain cannot contradict a prior host decision, while
// requiring an approval before it has any usable knowledge traps a new host in
// an empty-state loop. The predicate below is intentionally narrow and shared.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ingestText } from '@/lib/ingest/pipeline';
import type { BrainSegment } from '@/lib/ingest/segment';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;
type SetupSourceType = 'listing_url' | 'document' | 'text_paste';

export interface InitialSetupState {
  status: Database['public']['Enums']['property_status'];
  existingBrainItemCount: number;
}

export function shouldAutofill({ status, existingBrainItemCount }: InitialSetupState): boolean {
  return status === 'draft' && Number.isInteger(existingBrainItemCount) && existingBrainItemCount === 0;
}

/**
 * Returns true only for a draft property with zero non-deleted brain_items.
 * The count deliberately includes every creator: a prior import is sufficient
 * evidence that this is no longer an empty first-setup Brain.
 */
export async function isInitialSetup(client: Client, propertyId: string): Promise<boolean> {
  const [{ data: property, error: propertyError }, { count, error: brainError }] = await Promise.all([
    client.from('properties').select('status').eq('id', propertyId).maybeSingle(),
    client.from('brain_items').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).is('deleted_at', null),
  ]);

  if (propertyError || brainError || !property) {
    log.warn('brain_autofill_setup_check_failed', {
      propertyId,
      propertyError: propertyError?.message,
      brainError: brainError?.message,
    });
    return false;
  }

  return shouldAutofill({ status: property.status, existingBrainItemCount: count ?? 0 });
}

export interface AutofillInput {
  propertyId: string;
  hostAccountId: string;
  actorProfileId: string | null;
  sourceType: SetupSourceType;
  sourceRef?: string | null;
  segments: BrainSegment[];
}

export interface AutofillResult {
  created: number;
  filed: Array<{ category: BrainSegment['category']; title: string; brainItemId: string }>;
  failed: number;
}

function pipelineSource(sourceType: SetupSourceType, sourceRef?: string | null) {
  if (sourceType === 'listing_url') {
    return { sourceType: 'url' as const, kind: 'url' as const, sourceUrl: sourceRef ?? null };
  }
  if (sourceType === 'document') {
    return { sourceType: 'document' as const, kind: 'document' as const, documentId: sourceRef ?? null };
  }
  return { sourceType: 'manual_entry' as const, kind: 'document' as const };
}

/**
 * Uses the normal ingestion pipeline for every filed segment, keeping setup
 * content on the same chunking, embedding, and provenance path as an approved
 * proposal. Individual failures are isolated so one bad segment cannot discard
 * the useful sections from the same source.
 */
export async function autofillBrainFromSegments(admin: Client, input: AutofillInput): Promise<AutofillResult> {
  const filed: AutofillResult['filed'] = [];
  let failed = 0;
  const source = pipelineSource(input.sourceType, input.sourceRef);

  for (const segment of input.segments) {
    try {
      const result = await ingestText(admin, {
        propertyId: input.propertyId,
        title: segment.title,
        text: segment.text,
        category: segment.category,
        visibility: segment.visibility,
        ...source,
        createdBy: input.actorProfileId,
      });
      filed.push({ category: segment.category, title: segment.title, brainItemId: result.brainItemId });
    } catch (error) {
      failed += 1;
      log.warn('brain_autofill_segment_failed', {
        propertyId: input.propertyId,
        category: segment.category,
        title: segment.title,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  // One source import is one host action, even if it becomes many Brain rows.
  await audit(admin, {
    action: 'brain.autofill.applied',
    actorProfileId: input.actorProfileId,
    hostAccountId: input.hostAccountId,
    propertyId: input.propertyId,
    targetType: 'brain_autofill',
    metadata: {
      segmentCount: input.segments.length,
      categories: [...new Set(input.segments.map((segment) => segment.category))],
      sourceRef: input.sourceRef ?? null,
    },
  });

  return { created: filed.length, filed, failed };
}
