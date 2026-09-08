import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { notifyGuestConversationReply } from '@/lib/notify';
import { getGuestMessagingReadiness } from '@/lib/guest/messaging-readiness';
import { normalizeGuestAnswerForBrain } from '@/lib/brain/guest-answer-learning';
import { isMessageLocator } from '@/lib/notifications/links';
import { recordMessageWorkflow } from '@/lib/notifications/message-workflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_EXTRAS_STATUSES = ['requested', 'needs_details', 'accepted', 'payment_pending', 'scheduled'];

const postSchema = z.object({
  message: z.string().trim().min(1, 'Write a reply first.').max(2000),
  replyToMessageId: z.string().uuid().optional(),
  // Set when the reply targets an escalation directly (inbox deep link) rather
  // than a message carrying one.
  escalationId: z.string().uuid().optional(),
  // What happens to that escalation when the reply sends: resolved = Handled,
  // answered = Awaiting guest response, dismissed = Cancelled.
  escalationOutcome: z.enum(['resolved', 'answered', 'dismissed']).optional().default('answered'),
  // Set when the reply is the host's response to an Extras request bubble. The
  // request follows the reply: in progress for a normal reply, completed or
  // cancelled when the host chooses that outcome.
  extrasOrderId: z.string().uuid().optional(),
  extrasOutcome: z.enum(['accepted', 'fulfilled', 'canceled']).optional().default('accepted'),
  learnFromReply: z.boolean().optional().default(false),
});

function mapMessage(row: any) {
  return {
    id: row.id as string,
    role: row.role as 'guest' | 'host' | 'system' | 'assistant',
    content: row.content as string,
    createdAt: row.created_at as string,
    messageKind: (row.message_kind ?? 'text') as string,
    replyToMessageId: (row.reply_to_message_id ?? null) as string | null,
    escalationId: (row.escalation_id ?? null) as string | null,
    // Auto-translation of a guest message into the host's language (written by
    // the guest host-chat route; null when none was needed or produced).
    hostTranslation: (row.host_translation ?? null) as string | null,
    hostTranslationLang: (row.host_translation_lang ?? null) as string | null,
  };
}

async function loadConversation(admin: ReturnType<typeof createAdminClient>, propertyId: string, conversationId: string) {
  const { data } = await (admin as any)
    .from('conversations')
    .select('id, property_id, stay_id, title, channel, guest_session_id, guest_identity_id')
    .eq('id', conversationId)
    .eq('property_id', propertyId)
    .in('channel', ['host_chat', 'announcement'])
    .maybeSingle();
  return data as any | null;
}

async function loadExtrasOrders(db: any, propertyId: string, conversation: any) {
  const clauses = [
    `host_conversation_id.eq.${conversation.id}`,
    `conversation_id.eq.${conversation.id}`,
  ];
  if (conversation.guest_session_id) clauses.push(`guest_session_id.eq.${conversation.guest_session_id}`);
  const { data } = await db
    .from('extras_orders')
    .select('id, item_title, item_price_text, quantity, guest_note, request_number, fulfillment_status, scheduled_for, quoted_amount_cents, quote_currency, created_at')
    .eq('property_id', propertyId)
    .eq('stay_id', conversation.stay_id)
    .in('fulfillment_status', ACTIVE_EXTRAS_STATUSES)
    .or(clauses.join(','))
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as any[];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const { id, conversationId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to view guest chats.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const db = admin as any;
  const conversation = await loadConversation(admin, id, conversationId);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: rows, error } = await db
    .from('messages')
    .select('id, role, content, created_at, message_kind, reply_to_message_id, escalation_id, host_translation, host_translation_lang')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: 'Could not load messages.' }, { status: 500 });
  const messages = [...(rows ?? [])].reverse();
  const focusId = new URL(req.url).searchParams.get('message');
  if (focusId && (!isMessageLocator(focusId))) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  if (focusId && !messages.some((m) => m.id === focusId)) {
    const { data: focus } = await db.from('messages').select('*').eq('id', focusId)
      .eq('conversation_id', conversationId).eq('property_id', id).maybeSingle();
    if (!focus) return NextResponse.json({ error: 'Message not found in this conversation.' }, { status: 404 });
    messages.push(focus);
    messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // Escalation and Extras state ride along so the thread can badge the request
  // bubble and gate the highlighted Reply CTA without a second round-trip.
  const [{ data: escRows }, extrasOrders] = await Promise.all([
    db
      .from('escalations')
      .select('id, question, status, created_at, resolved_at')
      .eq('property_id', id)
      .eq('stay_id', conversation.stay_id)
      .or(`conversation_id.eq.${conversationId},host_conversation_id.eq.${conversationId}`)
      .order('created_at', { ascending: true })
      .limit(50),
    loadExtrasOrders(db, id, conversation),
  ]);

  await db
    .from('conversations')
    .update({ host_read_at: new Date().toISOString() })
    .eq('id', conversationId);

  const readiness = conversation.guest_session_id && conversation.stay_id
    ? await getGuestMessagingReadiness(admin, { sessionId: conversation.guest_session_id, stayId: conversation.stay_id, propertyId: id })
    : { ready: false };
  return NextResponse.json({
    conversation,
    messages: messages.map(mapMessage),
    guestSmsEligible: readiness.ready,
    escalations: escRows ?? [],
    extrasOrders: extrasOrders.map((order) => ({
      id: order.id,
      itemTitle: order.item_title,
      itemPriceText: order.item_price_text,
      quantity: order.quantity,
      guestNote: order.guest_note,
      requestNumber: order.request_number,
      fulfillmentStatus: order.fulfillment_status,
      scheduledFor: order.scheduled_for,
      quotedAmountCents: order.quoted_amount_cents,
      quoteCurrency: order.quote_currency,
      createdAt: order.created_at,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const { id, conversationId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to reply to guests.' }, { status: 403 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 });

  const member = access.member as any;
  const canLearnFromReply = access.isOwner || member?.can_publish_guest_answers === true;
  if (parsed.data.learnFromReply && !canLearnFromReply) {
    return NextResponse.json({ error: 'You do not have permission to propose Brain updates from guest replies.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const db = admin as any;
  const conversation = await loadConversation(admin, id, conversationId);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  if (!conversation.stay_id) return NextResponse.json({ error: 'This conversation has no stay.' }, { status: 400 });
  const { data: stay } = await db.from('stays').select('id, status, deleted_at')
    .eq('id', conversation.stay_id).eq('property_id', id).maybeSingle();
  if (!stay || stay.deleted_at || stay.status === 'revoked') return NextResponse.json({ error: 'Stay not available.' }, { status: 404 });

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to reply.' }, { status: 401 });
  const replyToId = parsed.data.replyToMessageId ?? null;
  let replyTo: any = null;
  if (replyToId) {
    const { data } = await db
      .from('messages')
      .select('id, escalation_id, message_kind')
      .eq('id', replyToId)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'The message you are replying to was not found.' }, { status: 404 });
    replyTo = data;
  }
  if (replyTo?.escalation_id && parsed.data.escalationId && replyTo.escalation_id !== parsed.data.escalationId) {
    return NextResponse.json({ error: 'The escalation does not match this reply.' }, { status: 400 });
  }
  const escalationId = (replyTo?.escalation_id as string | undefined) ?? parsed.data.escalationId;
  let escalation: any = null;
  if (escalationId) {
    const { data } = await db.from('escalations')
      .select('id, property_id, stay_id, question, status, guest_session_id, host_conversation_id, conversation_id')
      .eq('id', escalationId).eq('property_id', id).eq('stay_id', conversation.stay_id)
      .or(`conversation_id.eq.${conversationId},host_conversation_id.eq.${conversationId}`).maybeSingle();
    if (!data || (data.guest_session_id && data.guest_session_id !== conversation.guest_session_id)) {
      return NextResponse.json({ error: 'Escalation not found in this conversation.' }, { status: 404 });
    }
    escalation = data;
  }
  let extrasOrder: any = null;
  if (parsed.data.extrasOrderId) {
    const { data } = await db.from('extras_orders')
      .select('id, fulfillment_status, status, item_title, guest_session_id')
      .eq('id', parsed.data.extrasOrderId).eq('property_id', id).eq('stay_id', conversation.stay_id)
      .or(`conversation_id.eq.${conversationId},host_conversation_id.eq.${conversationId}`).maybeSingle();
    if (!data || (data.guest_session_id && data.guest_session_id !== conversation.guest_session_id)) {
      return NextResponse.json({ error: 'Extra request not found in this conversation.' }, { status: 404 });
    }
    extrasOrder = data;
  }
  if (parsed.data.learnFromReply && !escalation) {
    return NextResponse.json({ error: 'Select an escalation before proposing a Brain update.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      property_id: id,
      role: 'host',
      content: parsed.data.message,
      author_profile_id: user?.id ?? null,
      message_kind: 'text',
      reply_to_message_id: replyToId,
      escalation_id: (replyTo?.escalation_id as string | undefined) ?? parsed.data.escalationId ?? null,
    })
    .select('id, role, content, created_at, message_kind, reply_to_message_id, escalation_id')
    .single();

  if (error) return NextResponse.json({ error: 'Could not send the reply.' }, { status: 500 });

  const workflowWarnings: string[] = [];
  await recordMessageWorkflow(db
    .from('conversations')
    .update({ last_message_at: now, host_read_at: now, guest_read_at: null })
    .eq('id', conversationId).select('id').maybeSingle(), workflowWarnings,
    'Your reply was saved, but the conversation summary could not be refreshed.');

  let learningQueued = false;
  let learningError: string | null = null;

  if (escalationId) {
    if (escalation) {
      const outcome = parsed.data.escalationOutcome;
      await recordMessageWorkflow(db
        .from('escalations')
        .update({
          host_response: parsed.data.message,
          status: outcome,
          responded_by: user?.id ?? null,
          responded_at: now,
          resolved_at: outcome === 'answered' ? null : now,
          pinned: outcome === 'answered',
          // A fresh reply always resurfaces the row in the inbox, even if the
          // host had already closed it.
          lifecycle_status: 'active',
          archived_at: null,
          host_conversation_id: conversationId,
          guest_session_id: conversation.guest_session_id,
          guest_identity_id: conversation.guest_identity_id,
        })
        .eq('id', escalationId).eq('property_id', id).eq('stay_id', conversation.stay_id).select('id').maybeSingle(),
        workflowWarnings, 'Your reply was saved, but the escalation status could not be updated. Refresh and update its status separately; do not resend the reply.');

      if (parsed.data.learnFromReply) {
        try {
          // Learn from the escalation thread only — never the whole
          // conversation — so the normalizer reads exactly the messages this
          // escalation resolved. Keeps the proposal focused and the token
          // spend small.
          const { data: threadRows } = await db
            .from('messages')
            .select('id, role, content, created_at')
            .eq('conversation_id', conversationId)
            .eq('escalation_id', escalationId)
            .order('created_at', { ascending: true })
            .limit(100);

          const normalized = await normalizeGuestAnswerForBrain({
            question: escalation.question,
            hostAnswer: parsed.data.message,
            threadMessages: (threadRows ?? []).map((row: any) => ({
              role: row.role,
              content: row.content,
              createdAt: row.created_at,
            })),
          });

          const { error: proposalError } = await db.from('proposed_updates').insert({
            property_id: id,
            host_account_id: (access.property as any).host_account_id,
            status: 'pending',
            field_path: 'host_qa.guest_reply',
            label: normalized.question.slice(0, 160),
            proposed_value: {
              question: normalized.question,
              answer: normalized.answer,
              category: normalized.category,
              section: normalized.section,
              rationale: normalized.rationale,
              sourceMessageIds: (threadRows ?? []).map((row: any) => row.id),
              model: normalized.model,
            },
            source_type: 'ai_suggestion',
            source_ref: escalation.id,
            confidence: normalized.confidence,
          });
          if (proposalError) throw proposalError;
          learningQueued = true;
        } catch {
          learningError = 'Could not queue the Brain update.';
        }
      }
    }
  }

  // Replying from an Extras request bubble updates that request's health in the
  // same motion, mirroring the escalation outcome dropdown. The existing
  // status endpoint remains the granular path; this handles the common reply.
  if (parsed.data.extrasOrderId) {
    const order = extrasOrder;
    if (order) {
      const nextStatus = parsed.data.extrasOutcome;
      const legacy = nextStatus === 'fulfilled' ? 'fulfilled' : nextStatus === 'canceled' ? 'cancelled' : 'confirmed';
      const extrasUpdated = await recordMessageWorkflow(db.from('extras_orders').update({
        fulfillment_status: nextStatus,
        status: legacy,
        host_note: parsed.data.message,
        updated_at: now,
      }).eq('id', order.id).eq('property_id', id).eq('stay_id', conversation.stay_id).select('id').maybeSingle(),
      workflowWarnings, 'Your reply was saved, but the extra request status could not be updated. Refresh and update it separately; do not resend the reply.');
      if (extrasUpdated) await recordMessageWorkflow(db.from('extras_order_events').insert({
        order_id: order.id,
        property_id: id,
        from_status: order.fulfillment_status,
        to_status: nextStatus,
        actor_type: 'host',
        actor_id: user?.id ?? null,
        note: 'Updated while replying in Host Chat.',
      }).select('id').maybeSingle(), workflowWarnings, 'The extra request was updated, but its activity entry could not be saved.');
    }
  }

  const notification = await notifyGuestConversationReply(admin, {
    propertyId: id, stayId: conversation.stay_id, conversationId,
    messageId: inserted.id, slug: access.property.slug,
  }).catch(() => ({ status: 'unknown' }));

  return NextResponse.json({ ok: true, messageStored: true, notification, workflowWarnings, message: mapMessage(inserted), learningQueued, learningError });
}
