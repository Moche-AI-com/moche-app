import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid escalation.' }, { status: 400 });

  const { slug } = await params;
  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('id, slug, display_name, host_account_id')
    .eq('slug', slug)
    .maybeSingle();

  if (!property || property.id !== session.propertyId) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }

  const db = admin as any;
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  let { data: escalation } = await db
    .from('escalations')
    .select('id, conversation_id, question, status')
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .eq('question', parsed.data.question)
    .in('status', ['open', 'answered'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!escalation) {
    const { data: created, error } = await db
      .from('escalations')
      .insert({
        property_id: session.propertyId,
        stay_id: session.stayId,
        conversation_id: null,
        question: parsed.data.question,
        status: 'open',
        guest_session_id: session.sessionId,
        pinned: true,
      })
      .select('id, conversation_id, question, status')
      .single();
    if (error) return NextResponse.json({ error: 'Could not notify the host.' }, { status: 500 });
    escalation = created;

    await notify(admin, {
      hostAccountId: (property as any).host_account_id,
      kind: 'escalation',
      title: `AI escalation at ${(property as any).display_name}`,
      body: parsed.data.question,
      propertyId: session.propertyId,
      // Deep link into the merged Stays tab (guest chat lives there now).
      link: `/dashboard/properties/${session.propertyId}/stays?stay=${session.stayId}`,
    }).catch(() => undefined);
  }

  const { data: sessionRow } = await db
    .from('guest_access_sessions')
    .select('guest_identity_id')
    .eq('id', session.sessionId)
    .maybeSingle();

  let { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .eq('channel', 'host_chat')
    .eq('guest_session_id', session.sessionId)
    .maybeSingle();

  if (!conversation) {
    const now = new Date().toISOString();
    const { data: createdConversation, error: conversationError } = await db
      .from('conversations')
      .insert({
        property_id: session.propertyId,
        stay_id: session.stayId,
        title: `Host Chat — ${session.guestDisplayName}`,
        channel: 'host_chat',
        guest_session_id: session.sessionId,
        guest_identity_id: sessionRow?.guest_identity_id ?? null,
        last_message_at: now,
      })
      .select('id')
      .single();
    if (conversationError) return NextResponse.json({ error: 'Could not open Host Chat.' }, { status: 500 });
    conversation = createdConversation;
  }

  await db
    .from('escalations')
    .update({
      host_conversation_id: conversation.id,
      guest_session_id: session.sessionId,
      guest_identity_id: sessionRow?.guest_identity_id ?? null,
      pinned: true,
    })
    .eq('id', escalation.id);

  const { data: existingMessage } = await db
    .from('messages')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('escalation_id', escalation.id)
    .maybeSingle();

  if (!existingMessage) {
    const now = new Date().toISOString();
    await db.from('messages').insert({
      conversation_id: conversation.id,
      property_id: session.propertyId,
      role: 'guest',
      content: parsed.data.question,
      message_kind: 'ai_escalation',
      escalation_id: escalation.id,
    });
    await db
      .from('conversations')
      .update({ last_message_at: now, host_read_at: null })
      .eq('id', conversation.id);
  }

  return NextResponse.json({ ok: true, escalationId: escalation.id, conversationId: conversation.id });
}
