import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { applyProposal } from '@/lib/brain/apply-proposal';
import { createProposal } from '@/lib/brain/proposal-store';
import type { ImportedReviewGroup } from './extract';

type Client = SupabaseClient<Database>;

export async function acceptImportedGroup(admin: Client, input: {
  propertyId: string;
  hostAccountId: string;
  actorProfileId: string;
  sourceUrl: string;
  group: ImportedReviewGroup;
  originalGroup?: ImportedReviewGroup;
}) {
  if (!input.group.detected || input.group.text.trim().length < 20) return { ok: false as const, error: 'There is no usable content in this group.' };
  const proposal = await createProposal(admin, {
    propertyId: input.propertyId,
    hostAccountId: input.hostAccountId,
    fieldPath: 'brain.listing_summary',
    label: input.group.title,
    originalValue: input.originalGroup
      ? { title: input.originalGroup.title, text: input.originalGroup.text }
      : null,
    proposedValue: { title: input.group.title, text: input.group.text, category: input.group.category, visibility: 'guest', sourceUrl: input.sourceUrl },
    sourceType: 'listing_url', sourceRef: input.sourceUrl, confidence: null,
  });
  if (!proposal.ok) return proposal;
  const applied = await applyProposal(admin, { propertyId: input.propertyId, fieldPath: 'brain.listing_summary', value: { title: input.group.title, text: input.group.text, category: input.group.category, visibility: 'guest', sourceUrl: input.sourceUrl }, actorProfileId: input.actorProfileId, sourceRef: input.sourceUrl });
  if (!applied.ok) return applied;

  const now = new Date().toISOString();
  const { error: proposalError } = await admin.from('proposed_updates').update({
    status: 'approved', reviewed_at: now, reviewed_by: input.actorProfileId, applied_at: now,
    applied_value: { title: input.group.title, text: input.group.text } as Database['public']['Tables']['proposed_updates']['Update']['applied_value'],
  }).eq('id', proposal.id);
  if (proposalError) return { ok: false as const, error: 'The accepted group was saved but its review record could not be finalized.' };

  const { error: statusError } = await admin.from('property_knowledge_requirement_status').upsert({
    property_id: input.propertyId, requirement_key: input.group.requirementKey, requirement_version: 1,
    status: 'satisfied', satisfied_at: now, evidence: { source: 'property_import', proposal_id: proposal.id }, updated_at: now,
  }, { onConflict: 'property_id,requirement_key' });
  if (statusError) return { ok: false as const, error: 'The accepted group was saved but readiness could not be updated.' };
  return { ok: true as const, proposalId: proposal.id, targetId: applied.targetId };
}
