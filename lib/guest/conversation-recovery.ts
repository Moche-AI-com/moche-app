import 'server-only';
import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { serverEnv } from '@/lib/env';
import { safeEqualHex } from '@/lib/crypto';
import { getGuestMessagingReadiness, type GuestMessagingReadiness, type GuestMessagingScope } from './messaging-readiness';

export const CONVERSATION_RECOVERY_COOKIE = 'moche_guest_conversation';
const GRANT_TTL_MS = 60 * 60_000;
const PHONE_PROOF_MAX_AGE_MS = 10 * 60_000;
const grantSchema = z.object({
  currentSessionId: z.string().uuid(),
  participantSessionId: z.string().uuid(),
  propertyId: z.string().uuid(),
  stayId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  currentProof: z.string(),
  participantProof: z.string(),
  expires: z.number().finite(),
});
type Grant = z.infer<typeof grantSchema>;
type Ready = Extract<GuestMessagingReadiness, { ready: true }>;

export function hasRecentPhoneProof(readiness: GuestMessagingReadiness): readiness is Ready {
  if (!readiness.ready) return false;
  const age = Date.now() - Date.parse(readiness.phoneVerifiedAt);
  return age >= 0 && age <= PHONE_PROOF_MAX_AGE_MS;
}

function signature(payload: string) {
  // Reuse the existing namespaced server-secret HMAC pattern, never a URL token.
  // Env's historical development default is public, not an authentication key.
  const secret = serverEnv.guestContactSalt;
  if (!secret || secret.trim().length < 32 || /change[-_ ]?me/i.test(secret)) throw new Error('Recovery unavailable.');
  return createHmac('sha256', `${secret}:guest-conversation-recovery:v1`).update(payload).digest('hex');
}

/** Called only after explicit recovery authorization. No identity, consent, or
 * foreign key is copied. The cookie grants one thread to this existing session. */
export function createConversationRecoveryGrant(
  scope: GuestMessagingScope, participantSessionId: string,
  target: { conversationId: string; messageId: string }, current: Ready, participant: Ready,
) {
  const expires = Math.min(Date.now() + GRANT_TTL_MS, Date.parse(current.expiresAt), Date.parse(participant.expiresAt));
  const grant: Grant = {
    currentSessionId: scope.sessionId, participantSessionId,
    propertyId: scope.propertyId, stayId: scope.stayId, ...target,
    currentProof: current.phoneVerifiedAt, participantProof: participant.phoneVerifiedAt, expires,
  };
  const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
  return { value: `${payload}.${signature(payload)}`, expires: new Date(expires) };
}

/** No recovery cookie => original exact-session authorization only. A valid
 * grant never authorizes another thread, property, stay, guest session, AI
 * history or guest profile. Revocation/STOP/phone changes take effect on reads
 * and writes, not just at issuance. Both participants remain independently ready. */
export async function recoveredConversationScope(
  admin: SupabaseClient<Database>, current: GuestMessagingScope, conversationId: string,
): Promise<GuestMessagingScope | null> {
  try {
    const token = (await cookies()).get(CONVERSATION_RECOVERY_COOKIE)?.value;
    if (!token || token.length > 3000) return null;
    const [payload, sig, extra] = token.split('.');
    if (extra || !payload || !sig || !/^[a-f0-9]{64}$/.test(sig) || !safeEqualHex(signature(payload), sig)) return null;
    const parsed = grantSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (!parsed.success) return null;
    const grant = parsed.data;
    if (grant.expires <= Date.now() || grant.expires > Date.now() + GRANT_TTL_MS ||
        grant.currentSessionId !== current.sessionId || grant.propertyId !== current.propertyId ||
        grant.stayId !== current.stayId || grant.conversationId !== conversationId) return null;
    const participant = { ...current, sessionId: grant.participantSessionId };
    const [currentReady, participantReady] = await Promise.all([
      getGuestMessagingReadiness(admin, current), getGuestMessagingReadiness(admin, participant),
    ]);
    if (!currentReady.ready || !participantReady.ready || currentReady.contact !== participantReady.contact ||
        currentReady.phoneVerifiedAt !== grant.currentProof || participantReady.phoneVerifiedAt !== grant.participantProof) return null;
    return participant;
  } catch { return null; }
}
