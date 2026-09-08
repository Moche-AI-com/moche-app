'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyEscalationLinkToken } from '@/lib/crypto';
import { escalationLinkAnswerSchema } from '@/lib/validation';
import { answerEscalationCore } from '@/app/dashboard/escalations/actions';
import { log } from '@/lib/log';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import type { SmsResult } from '@/lib/notify';

export interface AnswerLinkState {
  error?: string;
  ok?: boolean;
  notification?: SmsResult;
}

// Legacy signed links still require a live dashboard session and property reply
// capability. The token is a locator, never a substitute for authorization.
export async function answerViaLinkAction(
  _prev: AnswerLinkState,
  formData: FormData,
): Promise<AnswerLinkState> {
  const ctx = await requireSession();
  const parsed = escalationLinkAnswerSchema.safeParse({
    token: formData.get('token'),
    response: formData.get('response'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please write an answer.' };
  }

  const verified = verifyEscalationLinkToken(parsed.data.token);
  if (!verified) {
    return { error: 'This answer link is invalid or has expired. Please open your dashboard instead.' };
  }

  const admin = createAdminClient();

  const { data: esc } = await createClient()
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', verified.escalationId)
    .maybeSingle();
  if (!esc) return { error: 'This escalation no longer exists.' };
  if (esc.status !== 'open') return { error: 'This question has already been answered.' };
  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.replyGuests || !access.can.receiveEscalations) return { error: 'You do not have permission to reply.' };

  // A reply does not publish Brain content or infer a teaching opt-in.
  const result = await answerEscalationCore(admin, {
    escalationId: verified.escalationId,
    answerText: parsed.data.response,
    actorProfileId: ctx.user.id,
    convertToBrain: false,
  });
  if (result.error) {
    log.warn('escalation_link_answer_failed', {});
    return { error: result.error };
  }
  return { ok: true, notification: result.notification };
}
