import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { canTransitionExtrasOrder, type ExtrasOrderStatus } from '@/lib/dashboard/extras-orders';
import type { Json as DbJson } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host moves an extras order through its lifecycle. Shape deliberately mirrors
// the service-request status route so there is one pattern to learn, and the
// state machine itself is imported from lib/dashboard/extras-orders.ts so the
// buttons the UI renders and the transitions this route accepts cannot diverge.

const BodySchema = z.object({
  status: z.enum(['requested', 'confirmed', 'fulfilled', 'declined', 'cancelled']),
  hostNote: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string; orderId: string } }) {
  const access = await requirePropertyAccess(params.id);
  // Gate chosen to match the RLS UPDATE policy exactly. The database's
  // can_edit_property(prop) is "account owner OR a property_member with
  // can_edit_brain", so the app-layer check is the same disjunction. Using only
  // access.can.editProperty (owner-only) would lock out a co-host the database
  // would happily allow, which is a confusing 403 rather than a real boundary.
  const canManage = access.can.editProperty || access.can.editBrain;
  if (!canManage) {
    return NextResponse.json(
      { error: 'You do not have permission to manage extras for this property.' },
      { status: 403 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { status: nextStatus, hostNote } = parsed.data;

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('extras_orders')
    .select('id, property_id, status, host_note, item_title')
    .eq('id', params.orderId)
    .eq('property_id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

  const current = order.status as ExtrasOrderStatus;
  if (!canTransitionExtrasOrder(current, nextStatus)) {
    return NextResponse.json({ error: `Cannot move from "${current}" to "${nextStatus}".` }, { status: 409 });
  }

  const { error } = await admin
    .from('extras_orders')
    .update({
      status: nextStatus,
      host_note: hostNote ?? order.host_note,
    } as never)
    .eq('id', params.orderId);

  if (error) {
    log.warn('extras_order_status_update_failed', { orderId: params.orderId, error: error.message });
    return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
  }

  const user = await getUser();
  await audit(admin, {
    action: 'extras_order.status_changed',
    actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id,
    propertyId: params.id,
    targetType: 'extras_order',
    targetId: params.orderId,
    metadata: { from: current, to: nextStatus, item: order.item_title } as unknown as DbJson,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
