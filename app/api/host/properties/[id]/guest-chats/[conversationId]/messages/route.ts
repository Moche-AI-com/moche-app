import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { notifyGuestReply } from '@/lib/notify';
import { publicEnv } from '@/lib/env';
import { normalizeGuestAnswerForBrain } from '@/lib/brain/guest-answer-learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
  message: z.string().trim().min(1, 'Write a reply first.').max(2000),
  replyToMessageId: z.string().uuid().optional(),
  resolveEscalation: z.boolean().optional().default(false),
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
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
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: 'Could not load messages.' }, { status: 500 });

  // Escalation state rides along so the full-page thread can badge and gate the
  // highlighted Reply CTA without a second round-trip.
  const { data: escRows } = await db
    .from('escalations')
    .select('id, question, status, created_at, resolved_at')
    .eq('property_id', id)
    .or(`conversation_id.eq.${conversationId},host_conversation_id.eq.${conversationId}`)
    .order('created_at', { ascending: true })
    .limit(50);

  await db
    .from('conversations')
    .update({ host_read_at: new Date().toISOString() })
    .eq('id', conversationId);

  return NextResponse.json({ conversation, messages: (rows ?? []).map(mapMessage), escalations: escRows ?? [] });
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

  const user = await getUser();
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
      escalation_id: replyTo?.escalation_id ?? null,
    })
    .select('id, role, content, created_at, message_kind, reply_to_message_id, escalation_id')
    .single();

  if (error) return NextResponse.json({ error: 'Could not send the reply.' }, { status: 500 });

  await db
    .from('conversations')
    .update({ last_message_at: now, host_read_at: now, guest_read_at: null })
    .eq('id', conversationId);

  const escalationId = replyTo?.escalation_id as string | undefined;
  let learningQueued = false;
  let learningError: string | null = null;

  if (escalationId) {
    const { data: escalation } = await db
      .from('escalations')
      .select('id, property_id, stay_id, question, status')
      .eq('id', escalationId)
      .eq('property_id', id)
      .maybeSingle();

    if (escalation) {
      await db
        .from('escalations')
        .update({
          host_response: parsed.data.message,
          status: parsed.data.resolveEscalation ? 'resolved' : 'answered',
          responded_by: user?.id ?? null,
          responded_at: now,
          resolved_at: parsed.data.resolveEscalation ? now : null,
          pinned: parsed.data.resolveEscalation ? false : true,
          host_conversation_id: conversationId,
          guest_session_id: conversation.guest_session_id,
          guest_identity_id: conversation.guest_identity_id,
        })
        .eq('id', escalationId);

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
        } catch (learningFailure) {
          learningError = learningFailure instanceof Error ? learningFailure.message : 'Could not queue the Brain update.';
        }
      }
    }
  }

  if (conversation.guest_session_id) {
    const { data: guestSession } = await db
      .from('guest_access_sessions')
      .select('guest_contact, notification_consent')
      .eq('id', conversation.guest_session_id)
      .maybeSingle();
    if (guestSession?.notification_consent && guestSession.guest_contact) {
      await notifyGuestReply({
        contact: guestSession.guest_contact,
        propertyName: (access.property as any).display_name,
        portalUrl: `${publicEnv.appUrl}/g/${(access.property as any).slug}`,
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, message: mapMessage(inserted), learningQueued, learningError });
}
