'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { log } from '@/lib/log';

export interface ExtrasThreadTarget {
  url?: string;
  error?: string;
}

// Where a guest request gets handled: the guest's Host Chat thread. The order
// row remembers the thread (host_conversation_id) once known, so resolving is a
// plain lookup from then on. A first open of an older order finds or creates
// the thread, mirroring the guest-side creation in app/api/guest/[slug]/host-chat.
export async function openExtrasThreadAction(orderId: string): Promise<ExtrasThreadTarget> {
  await requireSession();
  const supabase = createClient();
  const { data: order } = await supabase
    .from('extras_orders')
    .select('id, property_id, stay_id, host_conversation_id, guest_session_id, guest_identity_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { error: 'Request not found.' };

  const access = await requirePropertyAccess(order.property_id);
  if (!access.isOwner && !access.can.replyGuests) {
    return { error: 'You do not have permission to reply to guests for this property.' };
  }

  // Requests without a stay (legacy rows) have no thread to route to.
  if (!order.stay_id) return { error: 'This request is not linked to a stay.' };

  const admin = createAdminClient();
  const db = admin as any;
  const propertyId = order.property_id;
  const stayId = order.stay_id;

  let conversationId = order.host_conversation_id ?? null;

  if (!conversationId && order.guest_session_id) {
    const { data } = await db
      .from('conversations')
      .select('id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .eq('channel', 'host_chat')
      .eq('guest_session_id', order.guest_session_id)
      .maybeSingle();
    conversationId = data?.id ?? null;
  }
  if (!conversationId && order.guest_identity_id) {
    const { data } = await db
      .from('conversations')
      .select('id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .eq('channel', 'host_chat')
      .eq('guest_identity_id', order.guest_identity_id)
      .maybeSingle();
    conversationId = data?.id ?? null;
  }

  if (!conversationId) {
    let guestName = 'Guest';
    if (order.guest_identity_id) {
      const { data: identity } = await db
        .from('guest_identities')
        .select('first_name, last_name, display_name')
        .eq('id', order.guest_identity_id)
        .maybeSingle();
      const full = [identity?.first_name, identity?.last_name].filter(Boolean).join(' ').trim();
      if (full || identity?.display_name) guestName = full || identity.display_name;
    }
    if (guestName === 'Guest') {
      const { data: stay } = await db.from('stays').select('guest_display_name').eq('id', stayId).maybeSingle();
      if (stay?.guest_display_name) guestName = stay.guest_display_name;
    }

    const now = new Date().toISOString();
    const { data: created, error: convErr } = await db
      .from('conversations')
      .insert({
        property_id: propertyId,
        stay_id: stayId,
        title: `Host Chat — ${guestName}`,
        channel: 'host_chat',
        guest_session_id: order.guest_session_id,
        guest_identity_id: order.guest_identity_id,
        last_message_at: now,
      })
      .select('id')
      .single();
    if (convErr || !created) {
      log.warn('extras_thread_create_failed', { error: convErr?.message });
      return { error: 'Could not open the guest thread. Please try again.' };
    }
    conversationId = created.id;
  }

  // Remember the thread on the order so every later open is a plain lookup.
  if (!order.host_conversation_id) {
    await db
      .from('extras_orders')
      .update({ host_conversation_id: conversationId, updated_at: new Date().toISOString() })
      .eq('id', orderId);
  }

  return { url: `/dashboard/properties/${propertyId}/stays/${stayId}/conversations/${conversationId}` };
}
