import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestEscalateSchema } from '@/lib/validation';
import { notify } from '@/lib/notify';
import { getGuestMessagingReadiness } from '@/lib/guest/messaging-readiness';
import { hostConversationLink } from '@/lib/notifications/links';
import { capture } from '@/lib/posthog-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';
import { resolveLanguage, DEFAULT_HOST_LANGUAGE } from '@/lib/guest/languages';
import { translateForHost, notificationBody } from '@/lib/guest/translate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manual guest→host escalation: the guest deliberately "rings the bell for the host"
// and types their own issue. Unlike the low-confidence auto-escalation in the chat
// route, this is guest-initiated. It creates an OPEN escalation, records the guest's
// message in their conversation, and notifies the host (in-app + email/SMS fan-out).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestEscalateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please describe your issue.' }, { status: 400 });
  }
  const message = parsed.data.message;

  const admin = createAdminClient();

  const guestLanguage = resolveLanguage(parsed.data.language);

  // Confirm the slug matches the session's property (defense in depth).
  const { data: property } = await admin
    .from('properties')
    .select('id, display_name, slug, host_account_id')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }
  const readiness = await getGuestMessagingReadiness(admin, session);
  if (!readiness.ready) return NextResponse.json({ error: 'Connect your own verified phone and enable SMS in Host Chat first. The AI concierge remains available.', code: 'MESSAGING_NOT_READY' }, { status: 403 });

  // Rate-limit manual escalations per stay to prevent host-notification spam.
  const rl = await checkRateLimit(admin, {
    key: `guest_escalate:${session.sessionId}`,
    action: 'guest.escalate',
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'You have reached the request limit. Please wait before sending another.' },
      { status: 429 },
    );
  }

  // Get-or-create the conversation for this stay so the escalation threads with chat.
  let conversationId: string;
  const { data: existing } = await admin
    .from('conversations')
    .select('id')
    .eq('stay_id', session.stayId)
    .eq('property_id', session.propertyId)
    .eq('guest_session_id', session.sessionId)
    .eq('channel', 'host_chat')
    .maybeSingle();
  if (existing) {
    conversationId = (existing as { id: string }).id;
  } else {
    const { data: conv, error } = await admin
      .from('conversations')
      .insert({ property_id: session.propertyId, stay_id: session.stayId, guest_session_id: session.sessionId, channel: 'host_chat', title: 'Host Chat' } as never)
      .select('id')
      .single();
    if (error || !conv) return NextResponse.json({ error: 'Could not start the conversation.' }, { status: 500 });
    conversationId = (conv as { id: string }).id;
  }

  // The host reads their escalation queue in their own language. Translation is
  // best-effort and always keeps the guest's original text above it (see
  // lib/guest/translate.ts), so a translation outage degrades to today's behaviour
  // rather than blocking the guest from reaching their host.
  const { data: langSettings } = await admin
    .from('property_settings')
    .select('host_language')
    .eq('property_id', session.propertyId)
    .maybeSingle();
  const hostLanguage = (langSettings as { host_language?: string | null } | null)?.host_language ?? DEFAULT_HOST_LANGUAGE;
  const translated = await translateForHost(message, guestLanguage?.code ?? null, hostLanguage);

  if (guestLanguage) {
    void admin.from('stays').update({ guest_language: guestLanguage.code } as never).eq('id', session.stayId);
  }

  // Record the guest's message so it shows in the thread (guest + host views).
  // Stored verbatim: the thread is what the GUEST sees, so it stays in their words.
  const { data: savedMessage, error: saveError } = await admin.from('messages').insert({
    conversation_id: conversationId,
    property_id: session.propertyId,
    role: 'guest',
    content: message,
  } as never).select('id').single();
  if (saveError || !savedMessage) return NextResponse.json({ error: 'Could not save the request.' }, { status: 500 });

  // Reuse an existing OPEN escalation for this conversation if one is already pending
  // (avoids duplicate host pings when a guest sends several lines in quick succession).
  // Otherwise open a new one.
  const { data: openEsc } = await admin
    .from('escalations')
    .select('id, question, updated_at')
    .eq('conversation_id', conversationId)
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .eq('guest_session_id', session.sessionId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const openRow = openEsc as { id: string; question: string; updated_at: string } | null;
  let escId = openRow?.id ?? null;
  let created = false;

  if (!escId) {
    const { data: esc } = await admin
      .from('escalations')
      .insert({
        property_id: session.propertyId,
        stay_id: session.stayId,
        conversation_id: conversationId,
        host_conversation_id: conversationId,
        guest_session_id: session.sessionId,
        question: translated.text,
        status: 'open',
      } as never)
      .select('id')
      .single();
    escId = (esc as { id: string } | null)?.id ?? null;
    created = true;
  } else {
    // Reuse: refresh the escalation so the host sees the LATEST question and an updated
    // timestamp. This fixes host views showing a stale earlier question.
    await admin
      .from('escalations')
      .update({ question: translated.text, updated_at: new Date().toISOString() } as never)
      .eq('id', escId);
  }

  // Every authorized stored direct message gets its own exact-message ping.
  let notification: unknown = { inApp: 'not_attempted', sms: 'not_attempted' };
  if (escId) {
    await (admin as any).from('messages').update({ escalation_id: escId, message_kind: 'ai_escalation' }).eq('id', savedMessage.id).eq('conversation_id', conversationId);
    notification = await notify(admin, {
      hostAccountId: property.host_account_id,
      kind: 'host_message',
      title: 'A guest is asking for you',
      body: notificationBody(translated, message),
      propertyId: session.propertyId,
      link: hostConversationLink(session.propertyId, session.stayId, conversationId, savedMessage.id),
    }).catch(() => ({ inApp: 'failed', sms: 'unknown' }));
    await capture('escalation_created', session.propertyId, { property_id: session.propertyId, source: 'manual' });
    log.info('guest_manual_escalation_created', { escalationId: escId });
  }

  return NextResponse.json({ ok: true, messageStored: true, notification, escalationId: escId, alreadyOpen: !created });
}
