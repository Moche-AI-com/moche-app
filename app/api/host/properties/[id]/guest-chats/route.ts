import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_EXTRAS_STATUSES = ['requested', 'needs_details', 'accepted', 'payment_pending', 'scheduled'];

function guestNameFor(conversation: any, stay: any, identity: any) {
  const fullName = [identity?.first_name, identity?.last_name].filter(Boolean).join(' ').trim();
  return fullName || identity?.display_name || stay?.guest_display_name || conversation.title || 'Guest';
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to view guest chats.' }, { status: 403 });
  }

  const stayId = new URL(req.url).searchParams.get('stay');
  const admin = createAdminClient();
  const db = admin as any;

  let query = db
    .from('conversations')
    .select('id, stay_id, title, channel, guest_session_id, guest_identity_id, last_message_at, host_read_at, guest_read_at, created_at')
    .eq('property_id', propertyId)
    .in('channel', ['host_chat', 'announcement'])
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (stayId) query = query.eq('stay_id', stayId);

  const { data: conversations, error } = await query;
  if (error) return NextResponse.json({ error: 'Could not load guest chats.' }, { status: 500 });
  const rows = (conversations ?? []) as any[];
  const conversationIds = rows.map((row) => row.id);
  const stayIds = [...new Set(rows.map((row) => row.stay_id).filter(Boolean))];
  const sessionIds = [...new Set(rows.map((row) => row.guest_session_id).filter(Boolean))];
  const identityIds = [...new Set(rows.map((row) => row.guest_identity_id).filter(Boolean))];

  const [staysResult, sessionsResult, identitiesResult, messagesResult, escalationsResult, extrasResult] = await Promise.all([
    stayIds.length ? db.from('stays').select('id, guest_display_name, status, check_in, check_out').in('id', stayIds) : Promise.resolve({ data: [] }),
    sessionIds.length ? db.from('guest_access_sessions').select('id, guest_contact, notification_consent, registered_at').in('id', sessionIds) : Promise.resolve({ data: [] }),
    identityIds.length ? db.from('guest_identities').select('id, first_name, last_name, display_name, contact_last4').in('id', identityIds) : Promise.resolve({ data: [] }),
    conversationIds.length ? db.from('messages').select('id, conversation_id, role, content, created_at, message_kind, escalation_id').in('conversation_id', conversationIds).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    db.from('escalations').select('id, conversation_id, host_conversation_id, guest_session_id, status, pinned, created_at').eq('property_id', propertyId).in('status', ['open', 'answered']).limit(200),
    db.from('extras_orders')
      .select('id, host_conversation_id, conversation_id, guest_session_id, stay_id, fulfillment_status, created_at')
      .eq('property_id', propertyId)
      .in('fulfillment_status', ACTIVE_EXTRAS_STATUSES)
      .limit(200),
  ]);

  const stays = new Map(((staysResult.data ?? []) as any[]).map((row) => [row.id, row]));
  const sessions = new Map(((sessionsResult.data ?? []) as any[]).map((row) => [row.id, row]));
  const identities = new Map(((identitiesResult.data ?? []) as any[]).map((row) => [row.id, row]));
  const messages = (messagesResult.data ?? []) as any[];
  const escalations = (escalationsResult.data ?? []) as any[];
  const extrasOrders = (extrasResult.data ?? []) as any[];

  const latestByConversation = new Map<string, any>();
  const guestMessagesByConversation = new Map<string, any[]>();
  for (const message of messages) {
    if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
    if (message.role === 'guest') {
      const list = guestMessagesByConversation.get(message.conversation_id) ?? [];
      list.push(message);
      guestMessagesByConversation.set(message.conversation_id, list);
    }
  }

  const threads = rows.map((conversation) => {
    const stay = stays.get(conversation.stay_id);
    const identity = identities.get(conversation.guest_identity_id);
    const session = sessions.get(conversation.guest_session_id);
    const guestMessages = guestMessagesByConversation.get(conversation.id) ?? [];
    const unreadCount = guestMessages.filter((message) => !conversation.host_read_at || message.created_at > conversation.host_read_at).length;
    const unresolvedEscalations = escalations.filter((escalation) =>
      escalation.host_conversation_id === conversation.id ||
      escalation.conversation_id === conversation.id ||
      (conversation.guest_session_id && escalation.guest_session_id === conversation.guest_session_id)
    );
    const extrasCount = extrasOrders.filter((order) =>
      order.host_conversation_id === conversation.id ||
      order.conversation_id === conversation.id ||
      (conversation.guest_session_id && order.guest_session_id === conversation.guest_session_id) ||
      (conversation.stay_id && order.stay_id === conversation.stay_id)
    ).length;
    const latest = latestByConversation.get(conversation.id);

    return {
      id: conversation.id,
      stayId: conversation.stay_id,
      guestId: conversation.guest_identity_id ?? conversation.guest_session_id,
      guestName: guestNameFor(conversation, stay, identity),
      guestContactLast4: identity?.contact_last4 ?? null,
      stayStatus: stay?.status ?? null,
      checkIn: stay?.check_in ?? null,
      checkOut: stay?.check_out ?? null,
      channel: conversation.channel,
      lastMessageAt: conversation.last_message_at ?? latest?.created_at ?? conversation.created_at,
      lastMessagePreview: latest?.content ?? '',
      unreadCount,
      unresolvedEscalationCount: unresolvedEscalations.length,
      extrasCount,
      pinned: unresolvedEscalations.some((escalation) => escalation.pinned !== false),
      registered: Boolean(session?.registered_at),
    };
  }).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.extrasCount !== b.extrasCount) return b.extrasCount - a.extrasCount;
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return String(b.lastMessageAt).localeCompare(String(a.lastMessageAt));
  });

  return NextResponse.json({ threads });
}
