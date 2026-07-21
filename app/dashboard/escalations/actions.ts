'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { escalationRespondSchema } from '@/lib/validation';
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';

export interface EscalationActionState {
  error?: string;
  ok?: boolean;
}

// Answer an escalated guest question. This is the learning loop (Part D1): the host's
// answer is (1) saved + embedded as a guest-visible host_qa Brain item so future guests
// get it instantly, (2) delivered back into the guest conversation, and (3) recorded on
// the escalation. Teaching the Brain is the default, automatic behavior.
export async function answerEscalationAction(
  _prev: EscalationActionState,
  formData: FormData,
): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  const parsed = escalationRespondSchema.safeParse({ response: formData.get('response') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please write an answer.' };
  }
  const answerText = parsed.data.response;

  const ctx = await requireSession();
  const supabase = createClient();

  // RLS scopes escalations through properties the host can see.
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, question, conversation_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.editBrain) {
    return { error: 'You do not have permission to teach this property Brain.' };
  }

  const admin = createAdminClient();
  const title = esc.question.trim().slice(0, 200);

  // 1. Create the host_qa Brain item (guest-visible) from the answered question.
  const { data: created, error: biErr } = await supabase
    .from('brain_items')
    .insert({
      property_id: esc.property_id,
      title,
      body: answerText,
      category: 'host_qa',
      visibility: 'guest',
      source_type: 'host_qa',
      status: 'ready',
      created_by: ctx.user.id,
    })
    .select('id')
    .single();
  if (biErr || !created) {
    log.warn('escalation_brain_create_failed', { error: biErr?.message });
    return { error: 'Could not save the answer to your Brain.' };
  }

  // 2. Embed it so retrieval can serve it. reindexBrainItem also bumps the Brain
  //    version + clears the answer cache for this property (Part E invalidation).
  await reindexBrainItem(esc.property_id, created.id, title, answerText, 'guest', 'host_qa');

  // 3. Record the response on the escalation and link the created Brain item.
  await supabase
    .from('escalations')
    .update({
      host_response: answerText,
      status: 'answered',
      responded_at: new Date().toISOString(),
      responded_by: ctx.user.id,
      converted_brain_item_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', escalationId)
    .eq('property_id', esc.property_id);

  // 4. Deliver the answer into the guest conversation so it appears in their chat.
  //    messages has no host-side INSERT RLS policy (guest writes go via service role),
  //    so this insert uses the admin client, scoped by conversation + property.
  if (esc.conversation_id) {
    await admin.from('messages').insert({
      conversation_id: esc.conversation_id,
      property_id: esc.property_id,
      role: 'assistant',
      content: `Your host says: ${answerText}`,
      author_profile_id: ctx.user.id,
      model: 'host_answer',
    } as never);
  }

  await audit(supabase, {
    action: 'escalation.answered',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  await capture('escalation_answered', esc.property_id, { property_id: esc.property_id });

  revalidatePath('/dashboard/escalations');
  revalidatePath(`/dashboard/escalations/${escalationId}`);
  return { ok: true };
}
