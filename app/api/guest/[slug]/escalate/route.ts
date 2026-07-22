import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestEscalateSchema } from '@/lib/validation';
import { notify } from '@/lib/notify';
import { signEscalationLinkToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { capture } from '@/lib/posthog-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manual guest→host escalation: the guest deliberately "rings the bell for the host"
// and types their own issue. Unlike the low-confidence auto-escalation in the chat
// route, this is guest-initiated. It creates an OPEN escalation, records the guest's
// message in their conversation, and notifies the host (in-app + email/SMS fan-out).
export async function POST(req: Request, { params }: { params: { slug: string } }) {
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

  // Confirm the slug matches the session's property (defense in depth).
  const { data: property } = await admin
    .from('properties')
    .select('id, display_name, slug, host_account_id')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  // Rate-limit manual escalations per stay to prevent host-notification spam.
  const rl = await checkRateLimit(admin, {
    key: `guest_escalate:${session.stayId}`,
    action: 'guest.escalate',
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'You&rsquo;ve reached the message limit for now. Your host has already been notified.' },
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
    .maybeSingle();
  if (existing) {
    conversationId = (existing as { id: string }).id;
  } else {
    const { data: conv, error } = await admin
      .from('conversations')
      .insert({ property_id: session.propertyId, stay_id: session.stayId } as never)
      .select('id')
      .single();
    if (error || !conv) return NextResponse.json({ error: 'Could not start the conversation.' }, { status: 500 });
    conversationId = (conv as { id: string }).id;
  }

  // Record the guest's message so it shows in the thread (guest + host views).
  await admin.from('messages').insert({
    conversation_id: conversationId,
    property_id: session.propertyId,
    role: 'guest',
    content: message,
  } as never);

  // Reuse an existing OPEN escalation for this conversation if one is already pending
  // (avoids duplicate host pings when a guest sends several lines). Otherwise open one.
  const { data: openEsc } = await admin
    .from('escalations')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('property_id', session.propertyId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let escId = (openEsc as { id: string } | null)?.id ?? null;
  let created = false;
  if (!escId) {
    const { data: esc } = await admin
      .from('escalations')
      .insert({
        property_id: session.propertyId,
        stay_id: session.stayId,
        conversation_id: conversationId,
        question: message,
        status: 'open',
      } as never)
      .select('id')
      .single();
    escId = (esc as { id: string } | null)?.id ?? null;
    created = true;
  }

  // Notify the host. Only ping on a NEW escalation to avoid spamming on follow-ups; a
  // reused open escalation already alerted them.
  if (created && escId) {
    const answerUrl = `${publicEnv.appUrl}/answer/${signEscalationLinkToken(escId)}`;
    await notify(admin, {
      hostAccountId: property.host_account_id,
      kind: 'escalation',
      title: 'A guest is asking for you',
      body: message.slice(0, 200),
      propertyId: session.propertyId,
      link: `/dashboard/escalations/${escId}`,
      actionUrl: answerUrl,
    });
    await capture('escalation_created', session.propertyId, { property_id: session.propertyId, source: 'manual' });
    log.info('guest_manual_escalation_created', { escalationId: escId });
  }

  return NextResponse.json({ ok: true, escalationId: escId, alreadyOpen: !created });
}
