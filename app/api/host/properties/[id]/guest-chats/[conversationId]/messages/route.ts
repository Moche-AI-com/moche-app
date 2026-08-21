import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { notifyGuestReply } from '@/lib/notify';
import { publicEnv } from '@/lib/env';
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
  message: z.string().trim().min(1, 'Write a reply first.').max(2000),
  replyToMessageId: z.string().uuid().optional(),
  resolveEscalation: z.boolean().optional().default(false),
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
  const conversation = await loadConversation(admin, id, conversationId);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: rows, error } = await (admin as any)
    .from('messages')
    .select('id, role, content, created_at, message_kind, reply_to_message_id, escalation_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: 'Could not load messages.' }, { status: 500 });

  await (admin as any)
    .from('conversations')
    .update({ host_read_at: new Date().toISOString() })
    .eq('id', conversationId);

  return NextResponse.json({ conversation, messages: (rows ?? []).map(mapMessage) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const { id, conversationId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to reply to guests.' }, { status: 403 });
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write a reply first.' }, { status: 400 });

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
  if (escalationId) {
    const { data: escalation } = await db
      .from('escalations')
      .select('id, property_id, stay_id, question, status')
      .eq('id', escalationId)
      .eq('property_id', id)
      .maybeSingle();

    if (escalation) {
      const member = access.member as any;
      const canPublish = access.isOwner || member?.can_publish_guest_answers === true;
      let brainItemId: string | null = null;

      if (canPublish) {
        const title = String(escalation.question ?? 'Guest question').slice(0, 160);
        const { data: brainItem, error: brainError } = await db
          .from('brain_items')
          .insert({
            property_id: id,
            category: 'host_qa',
            title,
            body: parsed.data.message,
            visibility: 'guest',
            source_type: 'host_qa',
            status: 'ready',
            created_by: user?.id ?? null,
          })
          .select('id')
          .single();
        if (!brainError && brainItem?.id) {
          brainItemId = brainItem.id;
          await reindexBrainItem(id, brainItem.id, title, parsed.data.message, 'guest', 'host_qa').catch(() => undefined);
        }
      } else {
        await db.from('proposed_updates').insert({
          property_id: id,
          host_account_id: (access.property as any).host_account_id,
          status: 'pending',
          field_path: 'host_qa.escalation_answer',
          label: String(escalation.question ?? 'Guest escalation answer').slice(0, 160),
          proposed_value: { question: escalation.question, answer: parsed.data.message, category: 'host_qa' },
          source_type: 'ai_suggestion',
          source_ref: escalation.id,
          confidence: 0.9,
        }).catch(() => undefined);
      }

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
          converted_brain_item_id: brainItemId,
        })
        .eq('id', escalationId);
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

  return NextResponse.json({ ok: true, message: mapMessage(inserted) });
}
