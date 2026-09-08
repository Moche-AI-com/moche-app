import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';
import { isSmsSuppressed } from '@/lib/notifications/sms-suppression';
export { normalizeSmsPhone } from '@/lib/notifications/phone';
import { normalizeSmsPhone } from '@/lib/notifications/phone';

export type GuestMessagingScope = { sessionId: string; stayId: string; propertyId: string };
export type GuestMessagingReadiness =
  | { ready: true; contact: string; reason: null; phoneVerifiedAt: string; expiresAt: string }
  | { ready: false; contact: null; reason: 'session_unavailable' | 'registration_required' | 'terms_required' | 'phone_required' | 'phone_unverified' | 'sms_consent_required' | 'sms_opted_out' };

/** Shared stay access is not phone verification. Never consult the booking's contact,
 * shared stay_guest pass, or another session for this person's phone or consent. */
export async function getGuestMessagingReadiness(
  admin: SupabaseClient<Database>,
  scope: GuestMessagingScope,
): Promise<GuestMessagingReadiness> {
  const denied = (reason: Exclude<GuestMessagingReadiness, { ready: true }>['reason']): GuestMessagingReadiness =>
    ({ ready: false, contact: null, reason });
  try {
    const { data: row, error } = await admin.from('guest_access_sessions')
      .select('*').eq('id', scope.sessionId).eq('stay_id', scope.stayId).eq('property_id', scope.propertyId).maybeSingle();
    const session = row as Record<string, unknown> | null;
    if (error || !session || session.status !== 'verified' || session.revoked_at ||
        !(Date.parse(String(session.expires_at)) > Date.now())) return denied('session_unavailable');
    const { data: stay, error: stayError } = await admin.from('stays')
      .select('status, deleted_at, check_out').eq('id', scope.stayId).eq('property_id', scope.propertyId).maybeSingle();
    if (stayError || !stay || stay.deleted_at || stay.status === 'revoked' ||
        !(Date.parse(stay.check_out) + DEFAULT_GRACE_PERIOD_HOURS * 3600000 > Date.now())) return denied('session_unavailable');
    if (!session.registered_at) return denied('registration_required');
    if (!session.terms_accepted_at) return denied('terms_required');
    const contact = typeof session.guest_contact === 'string' ? normalizeSmsPhone(session.guest_contact) : null;
    if (!contact || session.guest_contact_type !== 'phone') return denied('phone_required');
    if (session.sms_opted_out_at || await isSmsSuppressed(admin, contact)) return denied('sms_opted_out');
    const phoneVerifiedAt = String(session.phone_verified_at ?? '');
    if (!(Date.parse(phoneVerifiedAt) > 0) || Date.parse(phoneVerifiedAt) > Date.now()) return denied('phone_unverified');
    if (session.notification_consent !== true || !session.notification_consent_at) return denied('sms_consent_required');
    return { ready: true, contact, reason: null, phoneVerifiedAt, expiresAt: String(session.expires_at) };
  } catch {
    return denied('session_unavailable');
  }
}
