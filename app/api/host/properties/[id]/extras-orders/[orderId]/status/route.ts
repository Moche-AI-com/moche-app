import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import {
  canTransition,
  EXTRAS_FULFILLMENT_STATUSES,
  type ExtrasFulfillmentStatus,
  isTerminalExtrasStatus,
  legacyStatusForFulfillment,
} from '@/lib/extras/lifecycle';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  status: z.enum(EXTRAS_FULFILLMENT_STATUSES),
  hostNote: z.string().trim().max(1000).optional(),
  quotedAmountCents: z.number().int().min(0).max(10_000_000).optional(),
  quoteCurrency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, ctx) => {
  if (value.status === 'needs_details' && !value.hostNote) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Explain which details are needed.', path: ['hostNote'] });
  }
  if (value.status === 'declined' && !value.hostNote) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add a reason for declining.', path: ['hostNote'] });
  }
  if (value.status === 'scheduled' && !value.scheduledFor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a scheduled date and time.', path: ['scheduledFor'] });
  }
  if (value.quoteCurrency && value.quotedAmountCents === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A currency requires an estimate.', path: ['quotedAmountCents'] });
  }
});

export async function POST(req: Request, { params }: { params: { id: string; orderId: string } }) {
  const access = await requirePropertyAccess(params.id);
  const canManage = access.can.editProperty || access.can.editBrain;
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to manage extras for this property.' }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('extras_orders')
    .select('id, property_id, status, fulfillment_status, host_note, item_title, expires_at, declined_reason, quoted_amount_cents, quote_currency, scheduled_for')
    .eq('id', params.orderId)
    .eq('property_id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const current = (order.fulfillment_status ?? 'requested') as ExtrasFulfillmentStatus;
  const user = await getUser();

  // Expiration is lazy but durable: the first attempt to act on an overdue,
  // open request records the system transition and forbids the stale action.
  if (!isTerminalExtrasStatus(current) && order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
    const { error: expiryError } = await admin.from('extras_orders').update({
      fulfillment_status: 'expired',
      status: legacyStatusForFulfillment('expired'),
    } as never).eq('id', order.id);
    if (!expiryError) {
      const { error: expiryEventError } = await admin.from('extras_order_events').insert({
        order_id: order.id,
        property_id: params.id,
        from_status: current,
        to_status: 'expired',
        actor_type: 'system',
        note: 'Request expired before it was actioned.',
      } as never);
      if (expiryEventError) {
        await admin.from('extras_orders').update({
          fulfillment_status: current,
          status: order.status,
        } as never).eq('id', order.id);
        log.error('extras_order_expiry_event_insert_failed', { orderId: order.id, error: expiryEventError.message });
        return NextResponse.json({ error: 'Could not record this request expiration. Please retry.' }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'This request has expired.' }, { status: 409 });
  }

  const { status: nextStatus, hostNote, quotedAmountCents, quoteCurrency, scheduledFor } = parsed.data;
  if (!canTransition(current, nextStatus, 'host')) {
    return NextResponse.json({ error: `Cannot move from "${current}" to "${nextStatus}".` }, { status: 409 });
  }

  const updates: Record<string, unknown> = {
    fulfillment_status: nextStatus,
    status: legacyStatusForFulfillment(nextStatus),
    host_note: hostNote ?? order.host_note,
  };
  if (nextStatus === 'declined') updates.declined_reason = hostNote;
  if (quotedAmountCents !== undefined) {
    updates.quoted_amount_cents = quotedAmountCents;
    updates.quote_currency = quoteCurrency ?? 'usd';
  }
  if (nextStatus === 'scheduled') updates.scheduled_for = scheduledFor;

  const { error: updateError } = await admin.from('extras_orders').update(updates as never).eq('id', order.id);
  if (updateError) {
    log.warn('extras_order_status_update_failed', { orderId: params.orderId, error: updateError.message });
    return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
  }

  const { error: eventError } = await admin.from('extras_order_events').insert({
    order_id: order.id,
    property_id: params.id,
    from_status: current,
    to_status: nextStatus,
    actor_type: 'host',
    actor_id: user?.id ?? null,
    note: hostNote ?? null,
  } as never);
  if (eventError) {
    await admin.from('extras_orders').update({
      fulfillment_status: current,
      status: order.status,
      host_note: order.host_note,
      declined_reason: order.declined_reason,
      quoted_amount_cents: order.quoted_amount_cents,
      quote_currency: order.quote_currency,
      scheduled_for: order.scheduled_for,
    } as never).eq('id', order.id);
    log.error('extras_order_event_insert_failed', { orderId: params.orderId, error: eventError.message });
    return NextResponse.json({ error: 'Could not record this request change. Please retry.' }, { status: 500 });
  }

  await audit(admin, {
    action: 'extras_order.status_changed',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: params.id,
    targetType: 'extras_order',
    targetId: params.orderId,
    metadata: { from: current, to: nextStatus, item: order.item_title, request_only: true } as unknown as DbJson,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
