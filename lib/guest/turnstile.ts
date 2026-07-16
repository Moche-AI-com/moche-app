import 'server-only';
import { serverEnv } from '@/lib/env';

// Verifies a Cloudflare Turnstile token server-side.
// Dev fallback: when GUEST_VERIFY_DEV_FALLBACK is on OR no secret is configured,
// verification is skipped (clearly labeled dev behavior, never for production).
export async function verifyTurnstile(token: string | undefined, remoteIp?: string): Promise<boolean> {
  if (serverEnv.guestVerifyDevFallback || !serverEnv.turnstileSecret) {
    return true; // dev fallback — do NOT enable in production
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: serverEnv.turnstileSecret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
