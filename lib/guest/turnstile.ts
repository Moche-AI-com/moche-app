import 'server-only';
import { serverEnv, isProductionRuntime } from '@/lib/env';
import { log } from '@/lib/log';

let loggedSkip = false;
let loggedProdReject = false;

// Verifies a Cloudflare Turnstile token server-side against the siteverify API.
//
// Config-missing behaviour (no TURNSTILE_SECRET_KEY, or guest-verify dev fallback on):
//   - dev/preview  → SKIP the challenge (return true), logged once. Never for production.
//   - production   → FAIL SAFE (return false / reject), logged once. Missing bot protection
//                    in prod must not silently open the door.
export async function verifyTurnstile(token: string | undefined, remoteIp?: string): Promise<boolean> {
  const configMissing = serverEnv.guestVerifyDevFallback || !serverEnv.turnstileSecret;

  if (configMissing) {
    if (isProductionRuntime()) {
      if (!loggedProdReject) {
        log.error('turnstile_not_configured_in_production', {});
        loggedProdReject = true;
      }
      return false; // fail-safe: reject when prod is missing bot protection
    }
    if (!loggedSkip) {
      log.warn('turnstile_skipped_dev', {});
      loggedSkip = true;
    }
    return true; // dev/preview skip — do NOT enable in production
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
