import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestExtraUpdateSchema } from '@/lib/validation';
import {
  canTransition,
  legacyStatusForFulfillment,
  type ExtrasFulfillmentStatus,
} from '@/lib/extras/lifecycle';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { slug: string; orderId: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  const parsed = guestExtraUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: property } = await admin.from('properties').select('id, slug')
    .eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== params.slug) return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });

  const { data: order } = await admin.from('extras_orders')
    .select('id, property_id, stay_id, status, fulfillment_status, guest_note')
    .eq('id', params.orderId)
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });

  const current = (order.fulfillment_status ?? 'requested') as ExtrasFulfillmentStatus;
  const next = parsed.data.action === 'cancel' ? 'canceled' : 'requested';
  if (!canTransition(current, next, 'guest')) {
    return NextResponse.json({ error: 'This request can no longer be changed.' }, { status: 409 });
  }

  const note = parsed.data.note?.trim() ?? null;
  const guestNote = parsed.data.action === 'supply_details'
    ? [order.guest_note, note].filter(Boolean).join('\n\n')
    : order.guest_note;
  const { error: updateError } = await admin.from('extras_orders').update({
    fulfillment_status: next,
    status: legacyStatusForFulfillment(next),
    guest_note: guestNote,
  } as never).eq('id', order.id);
  if (updateError) return NextResponse.json({ error: 'Could not update your request.' }, { status: 500 });

  const { error: eventError } = await admin.from('extras_order_events').insert({
    order_id: order.id,
    property_id: session.propertyId,
    from_status: current,
    to_status: next,
    actor_type: 'guest',
    note: note ?? (next === 'canceled' ? 'Guest canceled this request.' : 'Guest supplied requested details.'),
  } as never);
  if (eventError) {
    await admin.from('extras_orders').update({
      fulfillment_status: current,
      status: order.status,
      guest_note: order.guest_note,
    } as never).eq('id', order.id);
    log.error('guest_extras_order_event_insert_failed', { orderId: order.id, error: eventError.message });
    return NextResponse.json({ error: 'Could not record your request change. Please retry.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: next });
}
