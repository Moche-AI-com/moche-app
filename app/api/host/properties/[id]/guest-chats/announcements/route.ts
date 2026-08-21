import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  stayId: z.string().uuid(),
  message: z.string().trim().min(1, 'Write an announcement first.').max(2000),
  conversationIds: z.array(z.string().uuid()).optional().default([]),
  selectAll: z.boolean().optional().default(false),
});

async function canSendAnnouncements(access: Awaited<ReturnType<typeof requirePropertyAccess>>) {
  if (access.isOwner) return true;
  return (access.member as any)?.can_send_announcements === true;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  if (!(await canSendAnnouncements(access))) {
    return NextResponse.json({ error: 'You do not have permission to send announcements.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write an announcement first.' }, { status: 400 });

  const { stayId, message, conversationIds, selectAll } = parsed.data;
  const admin = createAdminClient();
  const db = admin as any;
  const user = await getUser();

  const { data: stay } = await db
    .from('stays')
    .select('id, guest_display_name, status')
    .eq('id', stayId)
    .eq('property_id', propertyId)
    .maybeSingle();
  if (!stay) return NextResponse.json({ error: 'Stay not found.' }, { status: 404 });

  let conversations: any[] = [];
  if (selectAll) {
    const { data: sessions } = await db
      .from('guest_access_sessions')
      .select('id, guest_identity_id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .eq('status', 'verified')
      .not('registered_at', 'is', null);

    for (const session of sessions ?? []) {
      const { data: existing } = await db
        .from('conversations')
        .select('id, guest_session_id, guest_identity_id')
        .eq('property_id', propertyId)
        .eq('stay_id', stayId)
        .eq('channel', 'host_chat')
        .eq('guest_session_id', session.id)
        .maybeSingle();
      if (existing) {
        conversations.push(existing);
      } else {
        const { data: created } = await db
          .from('conversations')
          .insert({
            property_id: propertyId,
            stay_id: stayId,
            title: `Host Chat — ${stay.guest_display_name}`,
            channel: 'host_chat',
            guest_session_id: session.id,
            guest_identity_id: session.guest_identity_id,
          })
          .select('id, guest_session_id, guest_identity_id')
          .single();
        if (created) conversations.push(created);
      }
    }
  } else {
    const { data } = await db
      .from('conversations')
      .select('id, guest_session_id, guest_identity_id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .in('id', conversationIds);
    conversations = (data ?? []) as any[];
  }

  if (conversations.length === 0) {
    return NextResponse.json({ error: 'Select at least one guest chat.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: batch, error: batchError } = await db
    .from('announcement_batches')
    .insert({ property_id: propertyId, stay_id: stayId, created_by: user?.id ?? null, body: message })
    .select('id')
    .single();
  if (batchError) return NextResponse.json({ error: 'Could not create the announcement.' }, { status: 500 });

  let sent = 0;
  for (const conversation of conversations) {
    const { data: inserted, error } = await db
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        property_id: propertyId,
        role: 'host',
        content: message,
        author_profile_id: user?.id ?? null,
        message_kind: 'announcement',
      })
      .select('id')
      .single();

    await db.from('announcement_recipients').insert({
      batch_id: batch.id,
      conversation_id: conversation.id,
      guest_session_id: conversation.guest_session_id,
      guest_identity_id: conversation.guest_identity_id,
      status: error ? 'failed' : 'sent',
    });

    if (!error && inserted) {
      sent += 1;
      await db
        .from('conversations')
        .update({ last_message_at: now, host_read_at: now, guest_read_at: null })
        .eq('id', conversation.id);
    }
  }

  return NextResponse.json({ ok: true, batchId: batch.id, sent });
}
