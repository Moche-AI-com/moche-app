import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestExtraRequestSchema } from '@/lib/validation';
import { notify } from '@/lib/notify';
import { signEscalationLinkToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { capture } from '@/lib/posthog-server';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Add-on — a guest taps "Request" on an extra. We DO NOT invent a new
// notification channel: this reuses the EXISTING escalation + notify() path (the
// same one the chat route uses for low-confidence questions), so the host is
// alerted in-app, by email, and (Pro+, consented) by SMS, and can answer via the
// magic link.
//
// It ALSO writes an `extras_orders` row. The escalation is the alert; the order
// is the durable record. Without it a host who dismisses the notification has
// nothing to come back to, there is no requested/fulfilled/declined state, and
// extras never reach the Reports hub. The order write is best-effort and
// non-blocking: if it fails the guest still gets a successful request and the
// host still gets the alert, because losing the notification would be the worse
// failure of the two.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestExtraRequestSchema.safeParse(payload);
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
    .from('guest_extras')
    .select('id, title, price_text, active, property_id')
    .eq('id', parsed.data.offerId)
    .eq('property_id', session.propertyId)
    .maybeSingle();
  if (!offer || !offer.active) {
    return NextResponse.json({ error: 'That enhancement is no longer available.' }, { status: 404 });
  }

  const quantity = parsed.data.quantity ?? 1;
  const guestNote = parsed.data.note?.trim() || null;

  const priceSuffix = offer.price_text ? ` (${offer.price_text})` : '';
  const qtySuffix = quantity > 1 ? ` x${quantity}` : '';
  const notePart = guestNote ? ` Guest note: "${guestNote}"` : '';
  const question = `Enhancement request: ${offer.title}${qtySuffix}${priceSuffix}. Guest would like to add this to their stay.${notePart}`;

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

  // Durable order record. item_title / item_price_text are SNAPSHOTS: a later
  // catalog edit must not rewrite what this guest was quoted.
  const { error: orderError } = await admin.from('extras_orders').insert({
    property_id: session.propertyId,
    stay_id: session.stayId,
    conversation_id: conversationId,
    escalation_id: escId ?? null,
    extra_id: offer.id,
    item_title: offer.title,
    item_price_text: offer.price_text ?? null,
    quantity,
    guest_note: guestNote,
    status: 'requested',
  } as never);
  if (orderError) {
    // Deliberately not a 500: the host has already been alerted, so failing the
    // guest's request here would be a worse outcome than a missing queue row.
    log.warn('extras_order_insert_failed', { escalationId: escId, error: orderError.message });
  }

  log.info('guest_extra_request', { escalationId: escId, quantity });
  await capture('extra_requested', session.propertyId, { property_id: session.propertyId });

  return NextResponse.json({ ok: true });
}
