import 'server-only';

// Creation side of the AI approval queue.
//
// Separate from apply-proposal.ts on purpose: creating a proposal is an
// unprivileged, always-safe act (it writes to a table nothing reads for guest
// answers), while applying one is the privileged act. Keeping them in different
// modules means an ingestion path can never accidentally import the applier.
//
// Inserts run through the admin client because `proposed_updates` has no INSERT
// policy for `authenticated` — a browser session that could insert here could
// fabricate a proposal and approve its own fabrication.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { proposableField, normalizeProposedValue, type ProposalSourceType } from '@/lib/brain/proposals';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

export interface CreateProposalInput {
  propertyId: string;
  hostAccountId: string;
  fieldPath: string;
  /** Short host-facing description, e.g. "Property details from airbnb.com". */
  label: string;
  proposedValue: unknown;
  originalValue?: unknown;
  sourceType: ProposalSourceType;
  sourceRef?: string | null;
  /** 0..1 model confidence. Advisory only; never auto-approves. */
  confidence?: number | null;
}

export type CreateProposalResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createProposal(admin: Admin, input: CreateProposalInput): Promise<CreateProposalResult> {
  const field = proposableField(input.fieldPath);
  if (!field) return { ok: false, error: 'Unsupported field.' };

  const normalized = normalizeProposedValue(field, input.proposedValue);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const { data, error } = await admin
    .from('proposed_updates')
    .insert({
      property_id: input.propertyId,
      host_account_id: input.hostAccountId,
      field_path: field.path,
      label: input.label.trim().slice(0, 160) || field.label,
      proposed_value: normalized.value as Database['public']['Tables']['proposed_updates']['Insert']['proposed_value'],
      original_value:
        (input.originalValue ?? null) as Database['public']['Tables']['proposed_updates']['Insert']['original_value'],
      source_type: input.sourceType,
      source_ref: input.sourceRef ?? null,
      confidence: clampConfidence(input.confidence),
    })
    .select('id')
    .single();

  if (error || !data) {
    const msg = error?.message ?? 'Could not queue that suggestion.';
    log.warn('proposal_create_failed', { propertyId: input.propertyId, fieldPath: input.fieldPath, error: msg });
    return { ok: false, error: msg };
  }
  return { ok: true, id: data.id };
}

function clampConfidence(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, Number(v.toFixed(3))));
}
