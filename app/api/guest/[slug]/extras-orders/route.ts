import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: property } = await admin.from('properties')
    .select('id, slug')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: orders, error } = await admin.from('extras_orders')
    .select('id, request_number, item_title, item_price_text, item_variant, quantity, guest_note, host_note, fulfillment_status, quoted_amount_cents, quote_currency, payment_mode, scheduled_for, declined_reason, created_at, updated_at')
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load your requests.' }, { status: 500 });

  const orderIds = (orders ?? []).map((order) => order.id);
  const { data: events, error: eventsError } = orderIds.length
    ? await admin.from('extras_order_events')
      .select('id, order_id, from_status, to_status, actor_type, note, created_at')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (eventsError) return NextResponse.json({ error: 'Could not load your request timeline.' }, { status: 500 });

  return NextResponse.json({ orders: orders ?? [], events: events ?? [] });
}
