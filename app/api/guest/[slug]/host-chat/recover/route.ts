import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getGuestSession } from '@/lib/guest/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestMessagingReadiness } from '@/lib/guest/messaging-readiness';
import { CONVERSATION_RECOVERY_COOKIE, createConversationRecoveryGrant, hasRecentPhoneProof } from '@/lib/guest/conversation-recovery';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid(), confirm: z.literal(true) });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return NextResponse.json({ error: 'Recovery must be requested from this portal.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confirm the conversation you want to open.' }, { status: 400 });
  const admin = createAdminClient();
  const slug = (await params).slug;
  const { data: property } = await admin.from('properties').select('id').eq('slug', slug).maybeSingle();
  if (property?.id !== session.propertyId) return NextResponse.json({ error: 'Conversation unavailable.' }, { status: 404 });
  const current = await getGuestMessagingReadiness(admin, session);
  if (!hasRecentPhoneProof(current)) {
    return NextResponse.json({ error: 'Verify your own phone in this browser again, then explicitly open the conversation.', code: 'PHONE_PROOF_REQUIRED' }, { status: 403 });
  }
  const rate = await checkRateLimit(admin, { key: `guest_recovery:${session.sessionId}`, action: 'guest.conversation_recovery', limit: 5, windowSeconds: 600 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many recovery attempts. Please wait.' }, { status: 429 });

  const { conversationId, messageId } = parsed.data;
  const { data: conversation } = await (admin as any).from('conversations').select('guest_session_id')
    .eq('id', conversationId).eq('property_id', session.propertyId).eq('stay_id', session.stayId).eq('channel', 'host_chat').maybeSingle();
  const unavailable = () => NextResponse.json({ error: 'This conversation could not be recovered with your verified phone.' }, { status: 404 });
  if (!conversation?.guest_session_id) return unavailable();
  const { data: message } = await admin.from('messages').select('id')
    .eq('id', messageId).eq('conversation_id', conversationId).eq('property_id', session.propertyId).maybeSingle();
  if (!message) return unavailable();
  const participant = await getGuestMessagingReadiness(admin, { ...session, sessionId: conversation.guest_session_id });
  if (!participant.ready || participant.contact !== current.contact) return unavailable();
  try {
    const grant = createConversationRecoveryGrant(session, conversation.guest_session_id, { conversationId, messageId }, current, participant);
    const response = NextResponse.json({ ok: true, conversationId, messageId });
    response.cookies.set({
      name: CONVERSATION_RECOVERY_COOKIE, ...grant, httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', path: `/api/guest/${encodeURIComponent(slug)}/host-chat`,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'Recovery is unavailable. Please try again later.' }, { status: 503 });
  }
}
