'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { verifyEscalationLinkToken } from '@/lib/crypto';
import { escalationLinkAnswerSchema } from '@/lib/validation';
import { answerEscalationCore } from '@/app/dashboard/escalations/actions';
import { log } from '@/lib/log';

export interface AnswerLinkState {
  error?: string;
  ok?: boolean;
}

// Answer an escalation from the signed magic link — no dashboard session required.
// Trust flows entirely from the HMAC token: it is re-verified here (never trust a raw
// escalationId from the form), scoped to exactly one escalation, and the responder is
// resolved to that property's host-account owner. The answer runs through the SAME
// shared learning loop as the dashboard form. The token is NEVER logged.
export async function answerViaLinkAction(
  _prev: AnswerLinkState,
  formData: FormData,
): Promise<AnswerLinkState> {
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

  // Resolve the property's host-account owner as the acting profile for the learning loop.
  const { data: esc } = await admin
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', verified.escalationId)
    .maybeSingle();
  if (!esc) return { error: 'This escalation no longer exists.' };
  if (esc.status !== 'open') return { error: 'This question has already been answered.' };

  const { data: prop } = await admin
    .from('properties')
    .select('host_account_id')
    .eq('id', esc.property_id)
    .maybeSingle();
  if (!prop) return { error: 'This escalation no longer exists.' };

  const { data: account } = await admin
    .from('host_accounts')
    .select('owner_id')
    .eq('id', (prop as { host_account_id: string }).host_account_id)
    .maybeSingle();
  const ownerId = (account as { owner_id: string } | null)?.owner_id;
  if (!ownerId) return { error: 'Could not resolve your account. Please open your dashboard instead.' };

  // The magic-link (SMS/email) answer flow has no category-picker UI, so we keep the
  // default behavior: save to the Brain with the category AI-classified from context.
  // (answerEscalationCore defaults convertToBrain=true + AI classification.)
  const result = await answerEscalationCore(admin, {
    escalationId: verified.escalationId,
    answerText: parsed.data.response,
    actorProfileId: ownerId,
  });
  if (result.error) {
    log.warn('escalation_link_answer_failed', {});
    return { error: result.error };
  }
  return { ok: true };
}
