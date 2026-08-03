import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { generateSessionToken, hashSessionToken, hashIp } from '@/lib/crypto';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

interface StayLinkRow {
  id: string;
  stay_id: string | null;
  redemption_count: number;
  max_redemptions: number;
}

// Creates a verified guest session for a stay-link redemption. Shared by the legacy
// no-code redeem path and the WS-1 code-confirm path so both establish sessions
// identically (same shape as the OTP-to-contact confirm flow in verify/confirm).
// Returns null on failure — caller returns its own generic error to avoid signal leakage.
export async function createStaySessionFromLink(
  admin: Admin,
  opts: { propertyId: string; link: StayLinkRow; req: Request; ip: string; expiresAt: Date }
): Promise<{ sessionToken: string; expiresAt: Date } | null> {
  const { propertyId, link, req, ip, expiresAt } = opts;
  if (!link.stay_id) return null;

  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const ipHash = hashIp(ip);

  const { error: sessErr } = await admin.from('guest_access_sessions').insert({
    property_id: propertyId,
    stay_id: link.stay_id,
    session_token_hash: sessionTokenHash,
    status: 'verified',
    verified_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    ip_hash: ipHash,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
  } as never);
  if (sessErr) {
    log.warn('guest_link_session_create_failed', { error: sessErr.message });
    return null;
  }

  // Mark the stay active if it was still upcoming.
  await admin.from('stays').update({ status: 'active' } as never).eq('id', link.stay_id).eq('status', 'upcoming');

  // Count the redemption; consume the link if it has hit its cap.
  const nextCount = link.redemption_count + 1;
  await admin
    .from('guest_access_links')
    .update({
      redemption_count: nextCount,
      ...(nextCount >= link.max_redemptions ? { consumed_at: new Date().toISOString() } : {}),
    } as never)
    .eq('id', link.id);

  return { sessionToken, expiresAt };
}
