'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { escalationRespondSchema } from '@/lib/validation';
import { notifyGuestConversationReply, type SmsResult } from '@/lib/notify';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';
import type { BrainCategory } from '@/lib/brain/classify';
import { normalizeGuestAnswerForBrain } from '@/lib/brain/guest-answer-learning';
import { detectOneOffAnswer, oneOffReason } from '@/lib/brain/one-off';
import { hostConversationLink } from '@/lib/notifications/links';

type Client = SupabaseClient<Database>;

export interface EscalationActionState {
  error?: string;
  ok?: boolean;
  messageStored?: boolean;
  notification?: SmsResult;
  learningQueued?: boolean;
  warning?: string;
}

export async function answerEscalationCore(
  admin: Client,
  opts: {
    escalationId: string;
    answerText: string;
    actorProfileId: string;
    convertToBrain?: boolean;
    brainCategory?: BrainCategory;
  },
): Promise<EscalationActionState> {
  const { escalationId, answerText, actorProfileId } = opts;
  const convertToBrain = opts.convertToBrain ?? false;
  const ctx = await requireSession();
  if (actorProfileId !== ctx.user.id) return { error: 'Sign in as the replying host.' };
  if (!answerText.trim() || answerText.length > 4000) return { error: 'Write a reply of up to 4000 characters.' };

  const { data: esc } = await admin
    .from('escalations')
    .select('id, property_id, question, conversation_id, status, stay_id, host_conversation_id, guest_session_id')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };
  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations || !access.can.replyGuests || (convertToBrain && !access.can.editBrain)) {
    return { error: 'You do not have permission to perform this action.' };
  }
  const db = admin as any;
  if (!esc.stay_id) return { error: 'This escalation has no guest stay.' };
  const { data: stay } = await db.from('stays').select('id, status, deleted_at')
    .eq('id', esc.stay_id).eq('property_id', esc.property_id).maybeSingle();
  if (!stay || stay.deleted_at || stay.status === 'revoked') return { error: 'Stay not available.' };
  let sessionId = esc.guest_session_id;
  for (const pointer of [esc.conversation_id, esc.host_conversation_id].filter(Boolean)) {
    const { data: conversation } = await db.from('conversations').select('id, guest_session_id')
      .eq('id', pointer).eq('stay_id', esc.stay_id).eq('property_id', esc.property_id).maybeSingle();
    if (!conversation || !conversation.guest_session_id || (sessionId && sessionId !== conversation.guest_session_id)) {
      return { error: 'Escalation conversation scope does not match.' };
    }
    sessionId = conversation.guest_session_id;
  }
  if (!sessionId) return { error: 'This escalation cannot be linked to an individual guest.' };
  const { data: guestSession } = await db.from('guest_access_sessions').select('id, guest_identity_id, stay_guest_id')
    .eq('id', sessionId).eq('stay_id', esc.stay_id).eq('property_id', esc.property_id).maybeSingle();
  if (!guestSession) return { error: 'Guest session not found.' };

  const { data: prop } = await admin
    .from('properties')
    .select('host_account_id, display_name, slug')
    .eq('id', esc.property_id)
    .maybeSingle();
  if (!prop) return { error: 'Escalation not found.' };

  let { data: thread } = await db.from('conversations').select('id')
    .eq('property_id', esc.property_id).eq('stay_id', esc.stay_id).eq('guest_session_id', sessionId).eq('channel', 'host_chat')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!thread) {
    const created = await db.from('conversations').insert({
      property_id: esc.property_id, stay_id: esc.stay_id, guest_session_id: sessionId,
      guest_identity_id: guestSession.guest_identity_id, stay_guest_id: guestSession.stay_guest_id,
      title: 'Host Chat', channel: 'host_chat',
    }).select('id').single();
    if (created.error || !created.data) return { error: 'Could not open the guest conversation.' };
    thread = created.data;
  }
  const { data: message, error: messageError } = await db.from('messages').insert({
    conversation_id: thread.id, property_id: esc.property_id, role: 'host', content: answerText,
    author_profile_id: actorProfileId, model: 'host_answer', escalation_id: escalationId, message_kind: 'text',
  }).select('id').single();
  if (messageError || !message) return { error: 'Could not save the reply.' };
  const notification = await notifyGuestConversationReply(admin, {
    propertyId: esc.property_id, stayId: esc.stay_id, conversationId: thread.id, messageId: message.id, slug: prop.slug,
  }).catch((): SmsResult => ({ status: 'unknown' }));
  const { error: updateError } = await admin
    .from('escalations')
    .update({
      host_response: answerText,
      status: 'answered',
      responded_at: new Date().toISOString(),
      responded_by: actorProfileId,
      host_conversation_id: thread.id,
      guest_session_id: sessionId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', escalationId)
    .eq('property_id', esc.property_id);
  await db.from('conversations').update({ last_message_at: new Date().toISOString(), guest_read_at: null }).eq('id', thread.id);
  let learningQueued = false;
  let warning = updateError ? 'Reply saved, but escalation status could not be updated.' : undefined;
  if (convertToBrain) {
    // Issue #133, item 6: teach the Brain only from reusable policy. A stay-scoped
    // answer ("fine this once") is delivered to the guest but never queued as a
    // proposal — and the host sees why, on the answer form.
    const oneOff = detectOneOffAnswer(answerText);
    if (oneOff.oneOff) {
      warning = oneOffReason(oneOff.marker ?? 'stay-scoped');
    } else {
      try {
        const { data: context } = await db.from('messages').select('id, role, content, created_at')
          .eq('property_id', esc.property_id).eq('conversation_id', thread.id).eq('escalation_id', escalationId)
          .order('created_at', { ascending: false }).limit(60);
        const normalized = await normalizeGuestAnswerForBrain({
          question: esc.question, hostAnswer: answerText,
          threadMessages: [...(context ?? [])].reverse().map((m: any) => ({ role: m.role, content: m.content, createdAt: m.created_at })),
        });
        const { error } = await db.from('proposed_updates').insert({
          property_id: esc.property_id, host_account_id: prop.host_account_id, status: 'pending',
          field_path: 'host_qa.guest_reply', label: normalized.question.slice(0, 160),
          proposed_value: { question: normalized.question, answer: normalized.answer, category: normalized.category,
            section: normalized.section, rationale: normalized.rationale, model: normalized.model, sourceMessageIds: (context ?? []).map((m: any) => m.id) },
          source_type: 'ai_suggestion', source_ref: escalationId, confidence: normalized.confidence,
        });
        if (error) throw error;
        learningQueued = true;
      } catch { warning = 'Reply saved, but the Brain proposal could not be queued.'; }
    }
  }

  await audit(admin, {
    action: 'escalation.answered',
    actorProfileId,
    hostAccountId: (prop as { host_account_id: string }).host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  await capture('escalation_answered', esc.property_id, { property_id: esc.property_id });

  revalidatePath('/dashboard/escalations');
  revalidatePath(`/dashboard/escalations/${escalationId}`);
  return { ok: true, messageStored: true, notification, learningQueued, warning };
}

export async function answerEscalationAction(
  _prev: EscalationActionState,
  formData: FormData,
): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  const rawCategory = formData.get('brainCategory');
  const parsed = escalationRespondSchema.safeParse({
    response: formData.get('response'),
    convertToBrain: formData.get('convertToBrain') === 'on' || formData.get('convertToBrain') === 'true',
    brainCategory: rawCategory && rawCategory !== '' ? rawCategory : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please write an answer.' };
  }
  const answerText = parsed.data.response;
  const convertToBrain = parsed.data.convertToBrain;
  const hostPickedCategory =
    typeof rawCategory === 'string' && rawCategory !== '' && rawCategory !== 'auto';

  const ctx = await requireSession();
  const supabase = createClient();

  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations || !access.can.replyGuests) {
    return { error: 'You do not have permission to reply to guests for this property.' };
  }
  if (convertToBrain && !access.can.editBrain) {
    return { error: 'You do not have permission to teach this property Brain.' };
  }

  return answerEscalationCore(createAdminClient(), {
    escalationId,
    answerText,
    actorProfileId: ctx.user.id,
    convertToBrain,
    brainCategory: convertToBrain && hostPickedCategory ? parsed.data.brainCategory : undefined,
  });
}

export interface EscalationThreadTarget {
  url?: string;
  error?: string;
}

export async function openEscalationThreadAction(escalationId: string): Promise<EscalationThreadTarget> {
  await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, stay_id, conversation_id, host_conversation_id, guest_session_id, guest_identity_id, stay_guest_id')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations || !access.can.replyGuests) return { error: 'You do not have permission to manage escalations for this property.' };

  if (!esc.stay_id) return { url: `/dashboard/escalations/${escalationId}` };

  const admin = createAdminClient();
  const db = admin as any;
  const propertyId = esc.property_id;
  const stayId = esc.stay_id;
  const { data: scopedStay } = await db.from('stays').select('id').eq('id', stayId).eq('property_id', propertyId).maybeSingle();
  if (!scopedStay) return { error: 'Stay not found.' };
  let sessionId = esc.guest_session_id;
  for (const pointer of [esc.conversation_id, esc.host_conversation_id].filter(Boolean)) {
    const { data: thread } = await db.from('conversations').select('id, guest_session_id, channel')
      .eq('id', pointer).eq('property_id', propertyId).eq('stay_id', stayId).maybeSingle();
    if (!thread?.guest_session_id || (sessionId && sessionId !== thread.guest_session_id) ||
        (pointer === esc.host_conversation_id && thread.channel !== 'host_chat')) {
      return { error: 'Escalation conversation scope does not match.' };
    }
    sessionId = thread.guest_session_id;
  }
  if (!sessionId) return { error: 'This escalation cannot be linked to an individual guest.' };
  const { data: participant } = await db.from('guest_access_sessions').select('id, guest_identity_id, stay_guest_id')
    .eq('id', sessionId).eq('stay_id', stayId).eq('property_id', propertyId).maybeSingle();
  if (!participant) return { error: 'Guest session not found.' };
  let conversationId = esc.host_conversation_id ?? null;

  if (!conversationId) {
    const { data } = await db
      .from('conversations')
      .select('id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .eq('channel', 'host_chat')
      .eq('guest_session_id', sessionId)
      .order('created_at', { ascending: true }).limit(1)
      .maybeSingle();
    conversationId = data?.id ?? null;
  }
  if (!conversationId) {
    let guestName = 'Guest';
    if (esc.guest_identity_id) {
      const { data: identity } = await db
        .from('guest_identities')
        .select('first_name, last_name, display_name')
        .eq('id', esc.guest_identity_id)
        .maybeSingle();
      const full = [identity?.first_name, identity?.last_name].filter(Boolean).join(' ').trim();
      if (full || identity?.display_name) guestName = full || identity.display_name;
    }
    if (guestName === 'Guest') {
      const { data: stay } = await db.from('stays').select('guest_display_name').eq('id', stayId).maybeSingle();
      if (stay?.guest_display_name) guestName = stay.guest_display_name;
    }

    const now = new Date().toISOString();
    const { data: created, error: convErr } = await db
      .from('conversations')
      .insert({
        property_id: propertyId,
        stay_id: stayId,
        title: `Host Chat — ${guestName}`,
        channel: 'host_chat',
        guest_session_id: sessionId,
        guest_identity_id: participant.guest_identity_id,
        stay_guest_id: participant.stay_guest_id,
        last_message_at: now,
      })
      .select('id')
      .single();
    if (convErr || !created) {
      log.warn('escalation_thread_create_failed', {});
      return { error: 'Could not open the guest thread. Please try again.' };
    }
    conversationId = created.id;
  }

  if (!esc.host_conversation_id) {
    await db
      .from('escalations')
      .update({ host_conversation_id: conversationId, updated_at: new Date().toISOString() })
      .eq('id', escalationId).eq('property_id', propertyId).eq('stay_id', stayId);
  }

  if (!conversationId) return { error: 'Could not open the guest conversation.' };
  return { url: `${hostConversationLink(propertyId, stayId, conversationId)}?escalation=${escalationId}` };
}

const INBOX_STATUS_SET = ['resolved', 'answered', 'dismissed'] as const;

export async function setEscalationStatusAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!escalationId || !(INBOX_STATUS_SET as readonly string[]).includes(status)) return { error: 'Missing escalation or status.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };
  if (esc.status === status) return { ok: true };

  const now = new Date().toISOString();
  const terminal = status !== 'answered';
  const { error } = await supabase
    .from('escalations')
    .update({
      status: status as 'resolved' | 'answered' | 'dismissed',
      resolved_at: terminal ? now : null,
      pinned: !terminal,
      updated_at: now,
    } as never)
    .eq('id', escalationId);
  if (error) return { error: 'Could not update the escalation.' };

  await audit(supabase, {
    action: `escalation.${status}`,
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  revalidatePath('/dashboard/escalations');
  return { ok: true };
}

export async function closeEscalationAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };
  if (esc.status !== 'resolved' && esc.status !== 'dismissed') {
    return { error: 'Only handled or cancelled escalations can be closed.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('escalations')
    .update({ lifecycle_status: 'archived', archived_at: now, updated_at: now } as never)
    .eq('id', escalationId);
  if (error) return { error: 'Could not close the escalation.' };

  await audit(supabase, {
    action: 'escalation.closed',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  revalidatePath('/dashboard/escalations');
  revalidatePath('/dashboard/reports');
  return { ok: true };
}

export async function reopenEscalationAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };

  const { error } = await supabase
    .from('escalations')
    .update({ lifecycle_status: 'active', archived_at: null, updated_at: new Date().toISOString() } as never)
    .eq('id', escalationId);
  if (error) return { error: 'Could not reopen the escalation.' };

  await audit(supabase, {
    action: 'escalation.reopened',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  revalidatePath('/dashboard/escalations');
  revalidatePath('/dashboard/reports');
  return { ok: true };
}

export async function closeHandledEscalationsAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  if (!propertyId) return { error: 'Missing property.' };

  const ctx = await requireSession();
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };

  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('escalations')
    .update({ lifecycle_status: 'archived', archived_at: now, updated_at: now } as never)
    .eq('property_id', propertyId)
    .eq('lifecycle_status', 'active')
    .in('status', ['resolved', 'dismissed']);
  if (error) return { error: 'Could not close the handled escalations.' };

  await audit(supabase, {
    action: 'escalation.closed_all',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath('/dashboard/escalations');
  revalidatePath('/dashboard/reports');
  return { ok: true };
}
