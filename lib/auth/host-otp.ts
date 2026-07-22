import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { generateOtp, hashOtp, verifyOtp } from '@/lib/crypto';
import { sendHostOtp } from '@/lib/notify';
import { HOST_OTP_TTL_MINUTES, HOST_OTP_MAX_ATTEMPTS, HOST_OTP_MAX_PER_HOUR } from '@/lib/constants';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;
export type HostOtpPurpose = 'login' | 'phone_verify';

// Mints a hashed, single-use host OTP row and delivers the code over SMS. The code is
// bound to the user id (hashOtp) so a leaked hash can't be replayed elsewhere, and it is
// NEVER logged or returned. Rate-limited per user+purpose. Returns false on rate limit or
// (in real mode) SMS failure — the caller shows a generic message either way.
export async function createAndSendHostOtp(
  admin: Client,
  p: { userId: string; phone: string; purpose: HostOtpPurpose },
): Promise<{ ok: boolean; rateLimited?: boolean }> {
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('host_otp_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', p.userId)
    .eq('purpose', p.purpose)
    .gte('created_at', sinceIso);
  if ((count ?? 0) >= HOST_OTP_MAX_PER_HOUR) {
    log.warn('host_otp_rate_limited', { purpose: p.purpose });
    return { ok: false, rateLimited: true };
  }

  const code = generateOtp();
  const codeHash = hashOtp(code, p.userId);
  const expiresAt = new Date(Date.now() + HOST_OTP_TTL_MINUTES * 60 * 1000).toISOString();

  // Invalidate any prior unconsumed challenge of the same purpose (single active code).
  await admin
    .from('host_otp_challenges')
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq('user_id', p.userId)
    .eq('purpose', p.purpose)
    .is('consumed_at', null);

  const { error } = await admin.from('host_otp_challenges').insert({
    user_id: p.userId,
    purpose: p.purpose,
    code_hash: codeHash,
    phone_last4: p.phone.replace(/[^\d]/g, '').slice(-4) || null,
    expires_at: expiresAt,
    max_attempts: HOST_OTP_MAX_ATTEMPTS,
  } as never);
  if (error) {
    log.warn('host_otp_insert_failed', { error: error.message });
    return { ok: false };
  }

  // Dev fallback mirrors notifyGuestOtp: log a masked hint to the SERVER only.
  if (serverEnv.guestVerifyDevFallback) {
    // eslint-disable-next-line no-console
    console.info(`[dev-fallback] Host OTP (${p.purpose}) for user ${p.userId.slice(0, 8)}***: ${code}`);
    return { ok: true };
  }

  const sent = await sendHostOtp(p.phone, code);
  return { ok: sent };
}

// Verifies a host OTP against the newest unconsumed, unexpired challenge for this
// user+purpose. Enforces max attempts and consumes the row on success. Never logs the code.
export async function verifyHostOtp(
  admin: Client,
  p: { userId: string; purpose: HostOtpPurpose; code: string },
): Promise<boolean> {
  const { data: ch } = await admin
    .from('host_otp_challenges')
    .select('id, code_hash, expires_at, attempts, max_attempts')
    .eq('user_id', p.userId)
    .eq('purpose', p.purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .maybeSingle();
  if (!ch) return false;
  if (new Date(ch.expires_at) < new Date()) return false;
  if (ch.attempts >= ch.max_attempts) {
    await admin.from('host_otp_challenges').update({ consumed_at: new Date().toISOString() } as never).eq('id', ch.id);
    return false;
  }
  if (!verifyOtp(p.code, p.userId, ch.code_hash)) {
    await admin.from('host_otp_challenges').update({ attempts: ch.attempts + 1 } as never).eq('id', ch.id);
    return false;
  }
  await admin.from('host_otp_challenges').update({ consumed_at: new Date().toISOString() } as never).eq('id', ch.id);
  return true;
}

// True when the user has an active (unconsumed, unexpired) challenge of this purpose.
export async function hasActiveHostOtp(admin: Client, userId: string, purpose: HostOtpPurpose): Promise<boolean> {
  const { data: ch } = await admin
    .from('host_otp_challenges')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .maybeSingle();
  if (!ch) return false;
  return new Date(ch.expires_at) >= new Date();
}
