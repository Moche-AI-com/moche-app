'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';
import { bumpBrainVersion } from '@/lib/brain/cache';

export interface TrainingFlagState {
  error?: string;
  ok?: boolean;
}

/**
 * Include or exclude one host reply from AI training.
 *
 * When a host answers an escalated question, that answer lands in the guest's
 * thread as a `host` message. Most of those answers are genuinely reusable — they
 * are the single best source of property-specific truth the product has — but some
 * are situational ("I'm ten minutes away", "use the spare key just this once") and
 * repeating them to the next guest would be actively wrong.
 *
 * This flips `messages.ai_training_excluded` AND enforces it: excluding a reply
 * soft-deletes the Brain item that reply produced and drops its embedding chunks,
 * so the concierge stops retrieving it on the very next question. Re-including it
 * restores the item and re-embeds it. The flag is the record; the Brain write is
 * the effect — a flag with no enforcement would be a lie told in a nice badge.
 *
 * Nothing is deleted destructively: the guest keeps the message in their
 * conversation, the host keeps the record in Reports, and the Brain item is only
 * ever soft-deleted so a change of mind is one click back.
 *
 * Authorization deliberately reuses the Brain permission rather than inventing a
 * new one — deciding what the concierge may learn from IS editing the Brain.
 */
export async function setMessageTrainingAction(
  _prev: TrainingFlagState,
  formData: FormData,
): Promise<TrainingFlagState> {
  const messageId = String(formData.get('messageId') ?? '');
  const excluded = formData.get('excluded') === 'true';
  // Optional: the escalation this reply answered. Present it and we can also act on
  // the Brain item the reply created; absent and we only record the preference.
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!messageId) return { error: 'Missing message.' };

  const ctx = await requireSession();
  const supabase = createClient();

  // Read through the RLS-scoped client first. A host who cannot see the message
  // gets the same "not found" as a message that genuinely does not exist, so this
  // endpoint never confirms the existence of another account's data.
  const { data: msg } = await supabase
    .from('messages')
    .select('id, property_id, role')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return { error: 'Message not found.' };

  // Only host replies are host-authored, so only host replies are the host's to
  // withhold. Guest questions and AI answers are out of scope by design.
  if (msg.role !== 'host') {
    return { error: 'Only your own replies can be excluded from training.' };
  }

  const access = await requirePropertyAccess(msg.property_id);
  if (!access.can.editBrain) {
    return { error: 'You do not have permission to change what this property Brain learns.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('messages')
    .update({ ai_training_excluded: excluded } as never)
    .eq('id', messageId);
  if (error) return { error: 'Could not save that. Please try again.' };

  if (escalationId) {
    await applyToBrain(admin, { escalationId, propertyId: msg.property_id, excluded });
  }

  await audit(admin, {
    action: excluded ? 'message.training_excluded' : 'message.training_included',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    propertyId: msg.property_id,
    targetType: 'message',
    targetId: messageId,
  });

  revalidatePath('/dashboard/reports');
  revalidatePath(`/dashboard/properties/${msg.property_id}/brain`);
  return { ok: true };
}

// Makes the exclusion real in retrieval. Only touches the Brain item this escalation
// actually created — if the host originally chose not to teach the Brain there is
// nothing to withdraw, and this is a no-op.
async function applyToBrain(
  admin: ReturnType<typeof createAdminClient>,
  p: { escalationId: string; propertyId: string; excluded: boolean },
): Promise<void> {
  const { data: esc } = await admin
    .from('escalations')
    .select('converted_brain_item_id')
    .eq('id', p.escalationId)
    .eq('property_id', p.propertyId)
    .maybeSingle();
  const itemId = (esc as { converted_brain_item_id: string | null } | null)?.converted_brain_item_id;
  if (!itemId) return;

  const { data: item } = await admin
    .from('brain_items')
    .select('id, title, body, category, visibility')
    .eq('id', itemId)
    .eq('property_id', p.propertyId)
    .maybeSingle();
  if (!item) return;

  if (p.excluded) {
    // Soft-delete the item and hard-delete its chunks so retrieval drops it now,
    // mirroring deleteBrainItemAction rather than inventing a second withdrawal path.
    await admin
      .from('brain_items')
      .update({ deleted_at: new Date().toISOString(), status: 'stale' } as never)
      .eq('id', itemId)
      .eq('property_id', p.propertyId);
    await admin.from('document_chunks').delete().eq('brain_item_id', itemId).eq('property_id', p.propertyId);
    await bumpBrainVersion(admin, p.propertyId);
  } else {
    await admin
      .from('brain_items')
      .update({ deleted_at: null, status: 'ready' } as never)
      .eq('id', itemId)
      .eq('property_id', p.propertyId);
    // Re-embed: the chunks were removed on exclusion, so restoring the row alone
    // would leave a Brain item that is visible in the list but never retrieved.
    // A body-less item has nothing to embed, so restoring the row is the whole job.
    if (!item.body) return;
    await reindexBrainItem(
      p.propertyId,
      itemId,
      item.title,
      item.body,
      item.visibility as 'guest' | 'internal',
      item.category,
    );
  }
}
