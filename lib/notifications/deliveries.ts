import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import {
  shouldAdvanceStatus,
  type DeliveryChannel,
  type DeliveryStatus,
  type Urgency,
} from '@/lib/notifications/delivery-status';

// #195 PR 3. Server-only helpers over notification_deliveries / notifications.
// Never logs phone numbers, emails, or message bodies.

type AdminClient = ReturnType<typeof createAdminClient>;

export const SMS_CONVERSATION_WINDOW_MS = 10 * 60 * 1000;
export const SMS_HOURLY_CAP = 10;
export const COLLAPSE_WINDOW_MS = 10 * 60 * 1000;
const LIVE_SMS_STATUSES: DeliveryStatus[] = ['queued', 'sent', 'delivered'];

// New tables/columns are not in database.types yet; keep `any` inside this module.
const db = (client: AdminClient) => client as any;
const errMessage = (e: unknown) =>
  (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
    ? (e as { message: string }).message
    : 'unknown');

export type RecordDeliveryInput = {
  notificationId: string;
  recipientProfileId: string | null;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  reason?: string | null;
  providerRef?: string | null;
  attempt?: number;
};

export async function recordDelivery(client: AdminClient, input: RecordDeliveryInput): Promise<string | null> {
  const { data, error } = await db(client)
    .from('notification_deliveries')
    .insert({
      notification_id: input.notificationId,
      recipient_profile_id: input.recipientProfileId,
      channel: input.channel,
      status: input.status,
      reason: input.reason ?? null,
      provider_ref: input.providerRef ?? null,
      attempt: input.attempt ?? 1,
    })
    .select('id')
    .single();
  if (error) {
    log.warn('notification_delivery_record_failed', { channel: input.channel, error: errMessage(error) });
    return null;
  }
  return (data?.id as string) ?? null;
}

export type ProviderUpdateResult = 'updated' | 'ignored' | 'not_found' | 'error';

export async function updateDeliveryByProviderRef(
  client: AdminClient,
  providerRef: string,
  next: DeliveryStatus,
  reason: string | null,
): Promise<ProviderUpdateResult> {
  const { data: row, error } = await db(client)
    .from('notification_deliveries')
    .select('id, status')
    .eq('provider_ref', providerRef)
    .maybeSingle();
  if (error) {
    log.warn('notification_delivery_lookup_failed', { error: errMessage(error) });
    return 'error';
  }
  if (!row) return 'not_found';
  if (!shouldAdvanceStatus(row.status as DeliveryStatus, next)) return 'ignored';
  // Compare-and-set on the old status so concurrent callbacks can't regress it.
  const { error: updateError } = await db(client)
    .from('notification_deliveries')
    .update({ status: next, reason })
    .eq('id', row.id)
    .eq('status', row.status);
  if (updateError) {
    log.warn('notification_delivery_update_failed', { error: errMessage(updateError) });
    return 'error';
  }
  return 'updated';
}

export type SmsCapResult =
  | { allowed: true }
  | { allowed: false; reason: 'sms_conversation_window' | 'sms_hourly_cap' };

export async function checkSmsCaps(
  client: AdminClient,
  input: { recipientProfileId: string; conversationId: string | null; urgency: Urgency | null; now?: Date },
): Promise<SmsCapResult> {
  if (input.urgency === 'p1') return { allowed: true };
  const now = (input.now ?? new Date()).getTime();
  try {
    if (input.conversationId) {
      const since = new Date(now - SMS_CONVERSATION_WINDOW_MS).toISOString();
      const { count, error } = await db(client)
        .from('notification_deliveries')
        .select('id, notifications!inner(conversation_id)', { count: 'exact', head: true })
        .eq('recipient_profile_id', input.recipientProfileId)
        .eq('channel', 'sms')
        .in('status', LIVE_SMS_STATUSES)
        .gte('created_at', since)
        .eq('notifications.conversation_id', input.conversationId);
      if (error) throw error;
      if ((count ?? 0) > 0) return { allowed: false, reason: 'sms_conversation_window' };
    }
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const { count, error } = await db(client)
      .from('notification_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_profile_id', input.recipientProfileId)
      .eq('channel', 'sms')
      .in('status', LIVE_SMS_STATUSES)
      .gte('created_at', hourAgo);
    if (error) throw error;
    if ((count ?? 0) >= SMS_HOURLY_CAP) return { allowed: false, reason: 'sms_hourly_cap' };
    return { allowed: true };
  } catch (e) {
    // Fail open: a missed guest alert is worse than one extra text.
    log.warn('notification_sms_cap_check_failed', { error: errMessage(e) });
    return { allowed: true };
  }
}

// If the recipient already has an unacknowledged notification of the same kind
// for this conversation within the collapse window, bump its count instead of
// creating a new one. Returns null when the caller should create a new row.
export async function collapseIntoOpenNotification(
  client: AdminClient,
  input: { recipientProfileId: string; conversationId: string | null; kind: string; now?: Date },
): Promise<{ id: string; collapseCount: number } | null> {
  if (!input.conversationId) return null;
  const since = new Date((input.now ?? new Date()).getTime() - COLLAPSE_WINDOW_MS).toISOString();
  const { data, error } = await db(client)
    .from('notifications')
    .select('id, collapse_count')
    .eq('recipient_profile_id', input.recipientProfileId)
    .eq('conversation_id', input.conversationId)
    .eq('kind', input.kind)
    .is('acknowledged_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const current = typeof data.collapse_count === 'number' ? data.collapse_count : 1;
  const nextCount = current + 1;
  const { data: updated, error: updateError } = await db(client)
    .from('notifications')
    .update({ collapse_count: nextCount })
    .eq('id', data.id)
    .eq('collapse_count', current)
    .is('acknowledged_at', null)
    .select('id')
    .maybeSingle();
  if (updateError || !updated) return null;
  return { id: data.id as string, collapseCount: nextCount };
}

export async function acknowledgeConversation(
  client: AdminClient,
  input: { conversationId: string; profileId: string; now?: Date },
): Promise<number> {
  const stamp = (input.now ?? new Date()).toISOString();
  const { data, error } = await db(client)
    .from('notifications')
    .update({ acknowledged_at: stamp, acknowledged_by: input.profileId })
    .eq('recipient_profile_id', input.profileId)
    .eq('conversation_id', input.conversationId)
    .is('acknowledged_at', null)
    .select('id');
  if (error) {
    log.warn('notification_ack_conversation_failed', { error: errMessage(error) });
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

// Acknowledge one notification for its own recipient only. Returns the stored
// link (caller must sanitize) or null when the row isn't the caller's.
export async function acknowledgeNotification(
  client: AdminClient,
  input: { notificationId: string; profileId: string; now?: Date },
): Promise<{ link: string | null } | null> {
  const { data: row, error } = await db(client)
    .from('notifications')
    .select('id, link, conversation_id, acknowledged_at')
    .eq('id', input.notificationId)
    .eq('recipient_profile_id', input.profileId)
    .maybeSingle();
  if (error || !row) return null;
  if (!row.acknowledged_at) {
    const stamp = (input.now ?? new Date()).toISOString();
    const { error: ackError } = await db(client)
      .from('notifications')
      .update({ acknowledged_at: stamp, acknowledged_by: input.profileId })
      .eq('id', row.id)
      .is('acknowledged_at', null);
    if (ackError) log.warn('notification_ack_failed', { error: errMessage(ackError) });
    await db(client).from('notifications').update({ read_at: stamp }).eq('id', row.id).is('read_at', null);
    if (row.conversation_id) {
      await acknowledgeConversation(client, { conversationId: row.conversation_id, profileId: input.profileId, now: input.now });
    }
  }
  return { link: (row.link as string | null) ?? null };
}
