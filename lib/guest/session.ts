import 'server-only';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashSessionToken } from '@/lib/crypto';
import { GUEST_SESSION_COOKIE, DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';

export interface GuestSession {
  sessionId: string;
  stayId: string;
  propertyId: string;
  guestDisplayName: string;
  checkOut: string;
}

// Resolves the current guest session from the opaque httpOnly cookie.
// Returns null if missing/expired/revoked, or if the stay is over (checkout + grace).
// Guests are unauthenticated to Postgres, so this uses the service-role client;
// all reads are explicitly scoped by the session's own stay_id/property_id.
//
// Display name (party access redesign 2026-08-28): the name comes from the
// SESSION'S registered identity, not the stay record. stays.guest_display_name
// describes the booking contact — the wrong name for every other member of the
// party, each of whom now registers their own identity on their own device.
export async function getGuestSession(): Promise<GuestSession | null> {
  const token = (await cookies()).get(GUEST_SESSION_COOKIE)?.value;
  if (!token) return null;

  const admin = createAdminClient();
  const tokenHash = hashSessionToken(token);

  const { data: session } = await admin
    .from('guest_access_sessions')
    .select('id, stay_id, property_id, status, expires_at, revoked_at, guest_identity_id')
    .eq('session_token_hash', tokenHash)
    .maybeSingle();
  if (!session) return null;
  if (session.status !== 'verified') return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  // Verify the stay is still valid and not past checkout + grace.
  const { data: stay } = await admin
    .from('stays')
    .select('id, property_id, guest_display_name, check_out, status, deleted_at')
    .eq('id', session.stay_id)
    .maybeSingle();
  if (!stay || stay.deleted_at || stay.status === 'revoked') return null;
  if (stay.property_id !== session.property_id) return null;

  const graceMs = DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000;
  if (new Date(stay.check_out).getTime() + graceMs < Date.now()) {
    // Auto-expire the session past checkout + grace.
    await admin.from('guest_access_sessions').update({ status: 'expired' } as never).eq('id', session.id);
    return null;
  }

  let guestDisplayName = stay.guest_display_name;
  const identityId = (session as { guest_identity_id?: string | null }).guest_identity_id;
  if (identityId) {
    const { data: identity } = await (admin as any)
      .from('guest_identities')
      .select('display_name, first_name, last_name')
      .eq('id', identityId)
      .maybeSingle();
    if (identity) {
      const full = [identity.first_name, identity.last_name].filter(Boolean).join(' ').trim();
      guestDisplayName = full || identity.display_name || guestDisplayName;
    }
  }

  return {
    sessionId: session.id,
    stayId: stay.id,
    propertyId: stay.property_id,
    guestDisplayName,
    checkOut: stay.check_out,
  };
}

export function guestSessionCookieOptions(expiresAt: Date) {
  return {
    name: GUEST_SESSION_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
