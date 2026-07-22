import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestUpsellRequestSchema } from '@/lib/validation';
import { notify } from '@/lib/notify';
import { signEscalationLinkToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { capture } from '@/lib/posthog-server';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Add-on — a guest taps "Request" on an upsell offer. We DO NOT invent a new
// channel: this reuses the EXISTING escalation + notify() path (the same one the
// chat route uses for low-confidence questions), so the host is alerted in-app,
// by email, and (Pro+, consented) by SMS, and can answer via the magic link.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestUpsellRequestSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const admin = createAdminClient();

  // Defense in depth: the slug must match the session's property.
  const { data: property } = await admin
    .from('properties').select('id, slug, host_account_id').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  // The offer must belong to this property and be active.
  const { data: offer } = await admin
    .from('upsell_offers')
    .select('id, title, price_text, active, property_id')
    .eq('id', parsed.data.offerId)
    .eq('property_id', session.propertyId)
    .maybeSingle();
  if (!offer || !offer.active) {
    return NextResponse.json({ error: 'That enhancement is no longer available.' }, { status: 404 });
  }

  const priceSuffix = offer.price_text ? ` (${offer.price_text})` : '';
  const question = `Enhancement request: ${offer.title}${priceSuffix}. Guest would like to add this to their stay.`;

  // Get-or-create the conversation for this stay (same shape as the chat route)
  // so the request is threaded and visible to the host.
  let conversationId: string | null = null;
  const { data: existing } = await admin
    .from('conversations').select('id').eq('stay_id', session.stayId).eq('property_id', session.propertyId).maybeSingle();
  if (existing) {
    conversationId = existing.id;
  } else {
    const { data: conv } = await admin.from('conversations')
      .insert({ property_id: session.propertyId, stay_id: session.stayId } as never)
      .select('id').single();
    conversationId = (conv as { id: string } | null)?.id ?? null;
  }

  if (conversationId) {
    await admin.from('messages').insert({
      conversation_id: conversationId, property_id: session.propertyId, role: 'guest', content: question,
    } as never);
  }

  // Reuse the escalation mechanism the chat route uses.
  const { data: esc } = await admin.from('escalations').insert({
    property_id: session.propertyId,
    stay_id: session.stayId,
    conversation_id: conversationId,
    question,
    status: 'open',
  } as never).select('id').single();
  const escId = (esc as { id: string } | null)?.id;

  const answerUrl = escId ? `${publicEnv.appUrl}/answer/${signEscalationLinkToken(escId)}` : undefined;
  await notify(admin, {
    hostAccountId: property.host_account_id,
    kind: 'escalation',
    title: 'A guest wants to add an enhancement',
    body: question.slice(0, 200),
    propertyId: session.propertyId,
    link: escId ? `/dashboard/escalations/${escId}` : '/dashboard/escalations',
    actionUrl: answerUrl,
  });

  log.info('guest_upsell_request', { escalationId: escId });
  await capture('upsell_requested', session.propertyId, { property_id: session.propertyId });

  return NextResponse.json({ ok: true });
}
