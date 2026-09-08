import 'server-only';

// Retired setup shortcut. Even an empty Brain requires a proposed_update and
// explicit human approval. Keep the old entry points fail-closed so a stale
// caller cannot bypass the import routes' existing proposal workflow.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { BrainSegment } from '@/lib/ingest/segment';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;
type SetupSourceType = 'listing_url' | 'document' | 'text_paste';

export interface InitialSetupState {
  status: Database['public']['Enums']['property_status'];
  existingBrainItemCount: number;
}

export function shouldAutofill(_state: InitialSetupState): boolean {
  return false;
}

/**
 * Legacy permission check. Database state never authorizes an automatic AI
 * write; shouldAutofill also refuses a successfully read empty draft.
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

/**
 * No application caller remains. Fail loudly instead of silently publishing or
 * pretending an import succeeded. Supported imports use createProposal; only
 * the host's review decision may invoke the canonical ingestion pipeline.
 */
export async function autofillBrainFromSegments(_admin: Client, _input: AutofillInput): Promise<AutofillResult> {
  throw new Error('Automatic Brain filing is disabled. Create a proposal for human approval.');
}
