import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestExtraRequestSchema } from '@/lib/validation';
import { notify } from '@/lib/notify';
import { signEscalationLinkToken } from '@/lib/crypto';
import { publicEnv } from '@/lib/env';
import { capture } from '@/lib/posthog-server';
import { log } from '@/lib/log';
import { clampExtraQuantity, DEFAULT_EXTRA_QUANTITY, isPackageExtra, resolveExtraVariant } from '@/lib/guest/extras';
import { resolveLanguage, DEFAULT_HOST_LANGUAGE } from '@/lib/guest/languages';
import { translateForHost, notificationBody } from '@/lib/guest/translate';

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
    .select('id, title, price_text, active, property_id, max_quantity, kind, options, option_label, unit_label')
    .eq('id', parsed.data.offerId)
    .eq('property_id', session.propertyId)
    .maybeSingle();
  if (!offer || !offer.active) {
    return NextResponse.json({ error: 'That enhancement is no longer available.' }, { status: 404 });
  }

  // A package is a single bundle (golf package, wedding package): quantity is
  // meaningless for it, so it is pinned to 1 regardless of what the client sent.
  // For a countable item the client stepper already clamps, but a request can
  // arrive from anywhere, so the host's advisory ceiling is re-enforced here.
  const isPackage = isPackageExtra(offer.kind);
  const quantity = isPackage
    ? DEFAULT_EXTRA_QUANTITY
    : clampExtraQuantity(parsed.data.quantity ?? DEFAULT_EXTRA_QUANTITY, offer.max_quantity);

  // The variant must be one the host actually offers. A client-supplied string that
  // is not in the offer's own `options` array is dropped rather than echoed into a
  // host notification — otherwise the request body becomes guest-controlled text
  // masquerading as catalog data.
  const variant = resolveExtraVariant(parsed.data.variant, offer.options);
  if (!variant && !isPackage && Array.isArray(offer.options) && offer.options.length > 0) {
    return NextResponse.json({ error: 'Please choose an option before requesting this.' }, { status: 400 });
  }

  const guestNote = parsed.data.note?.trim() || null;

  const priceSuffix = offer.price_text ? ` (${offer.price_text})` : '';
  const unit = offer.unit_label?.trim();
  const qtySuffix = isPackage ? '' : quantity > 1 ? ` ×${quantity}${unit ? ` ${unit}` : ''}` : '';
  const variantSuffix = variant ? ` — ${offer.option_label?.trim() ? `${offer.option_label.trim()}: ` : ''}${variant}` : '';
  const notePart = guestNote ? ` Guest note: "${guestNote}"` : '';
  const lead = isPackage ? 'Package request' : 'Enhancement request';
  const question = `${lead}: ${offer.title}${variantSuffix}${qtySuffix}${priceSuffix}. Guest would like to add this to their stay.${notePart}`;

  // Host-language rendering, same contract as the chat and manual-escalation paths.
  // Only the guest's own free-text note is genuinely translatable here — the rest of
  // the line is catalog data in the host's own words — but running the whole line
  // keeps one code path and reads naturally in the host's queue.
  const guestLanguage = resolveLanguage(parsed.data.language);
  const { data: langSettings } = await admin
    .from('property_settings').select('host_language').eq('property_id', session.propertyId).maybeSingle();
  const hostLanguage = (langSettings as { host_language?: string | null } | null)?.host_language ?? DEFAULT_HOST_LANGUAGE;
  const translated = guestNote
    ? await translateForHost(question, guestLanguage?.code ?? null, hostLanguage)
    : { text: question, translated: null, targetLabel: null };

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
    question: translated.text,
    status: 'open',
  } as never).select('id').single();
  const escId = (esc as { id: string } | null)?.id;

  const answerUrl = escId ? `${publicEnv.appUrl}/answer/${signEscalationLinkToken(escId)}` : undefined;
  await notify(admin, {
    hostAccountId: property.host_account_id,
    kind: 'escalation',
    title: isPackage ? 'A guest wants to book a package' : 'A guest wants to add an enhancement',
    body: notificationBody(translated, question),
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
    item_variant: variant,
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
