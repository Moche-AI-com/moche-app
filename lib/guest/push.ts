import 'server-only';

import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign as cryptoSign,
} from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

// Guest web-push sender (issue #133, item 5) — dependency-free RFC 8291 payload
// encryption (aes128gcm) + RFC 8292 VAPID signing on node:crypto, so no new
// package (and no lockfile churn) is needed. Dark until VAPID keys exist:
// isPushConfigured() is false and every send skips cleanly.

type Client = SupabaseClient<Database>;

export interface VapidKeys { publicKey: string; privateKey: string }

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hmac(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

/** True only when both VAPID keys are configured. Push UI + sends gate on this. */
export function isPushConfigured(): boolean {
  return vapidKeys() !== null;
}

/**
 * RFC 8292 VAPID: a self-signed ES256 JWT proving we hold the private key for
 * the public key the browser subscribed with. aud is the push service origin;
 * no PII, no payload data — the token only carries audience, expiry, contact.
 */
export function buildVapidJwt(endpoint: string, keys: VapidKeys, sub = 'mailto:support@moche-ai.com'): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub,
  })));
  const input = `${header}.${payload}`;
  const publicRaw = fromB64url(keys.publicKey);
  if (publicRaw.length !== 65 || publicRaw[0] !== 4) throw new Error('VAPID public key is not an uncompressed P-256 point.');
  const key = createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(publicRaw.subarray(1, 33)),
      y: b64url(publicRaw.subarray(33, 65)),
      d: b64url(fromB64url(keys.privateKey)),
    },
  });
  const signature = cryptoSign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(signature)}`;
}

/**
 * RFC 8291 aes128gcm message encryption. Single record: salt + rs + ephemeral
 * server key + ciphertext. The payload is encrypted for exactly one browser
 * subscription (its p256dh key + auth secret); push services only ever relay
 * ciphertext.
 */
export function encryptPushPayload(p256dhB64: string, authB64: string, payload: string): Buffer {
  const uaPublic = fromB64url(p256dhB64);
  const authSecret = fromB64url(authB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('Subscription key is not an uncompressed P-256 point.');

  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // 65-byte uncompressed ephemeral server key
  const sharedSecret = ecdh.computeSecret(uaPublic);
  const salt = randomBytes(16);

  // RFC 8291 §3.3 key derivation chain (HKDF extract/expand, single block).
  const prkKey = hmac(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  // Final (only) record: payload + 0x02 last-record delimiter, no padding.
  const padded = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ciphertext]);
}

export type PushSendResult = 'sent' | 'not_configured' | 'no_subscription' | 'failed';

/**
 * Sends a neutral guest notification to every push subscription bound to THIS
 * guest session (stay + property scoped). No message bodies, no guest names —
 * the push carries a generic "your host replied" + a token-free portal link,
 * same contract as the guest SMS. Dead subscriptions (404/410) are removed.
 */
export async function sendGuestPush(client: Client, input: {
  sessionId: string;
  propertyId: string;
  stayId: string;
  title: string;
  body: string;
  url: string;
}): Promise<PushSendResult> {
  const keys = vapidKeys();
  if (!keys) return 'not_configured';

  const { data: subs, error } = await (client as any)
    .from('guest_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('guest_session_id', input.sessionId)
    .eq('property_id', input.propertyId)
    .eq('stay_id', input.stayId);
  if (error) {
    log.warn('guest_push_read_failed', {});
    return 'failed';
  }
  if (!subs || subs.length === 0) return 'no_subscription';

  const payload = JSON.stringify({ title: input.title, body: input.body, url: input.url });
  let sent = 0;
  for (const sub of subs as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      const encrypted = encryptPushPayload(sub.p256dh, sub.auth, payload);
      const jwt = buildVapidJwt(sub.endpoint, keys);
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '43200',
        },
        // Buffer<ArrayBufferLike> is not a BodyInit under the stricter Next 16
        // typings — copy into a plain Uint8Array<ArrayBuffer> for the wire.
        body: Uint8Array.from(encrypted),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status >= 200 && res.status < 300) {
        sent++;
      } else if (res.status === 404 || res.status === 410) {
        // The browser revoked this subscription for good — stop keeping it.
        await (client as any).from('guest_push_subscriptions').delete().eq('id', sub.id);
      } else {
        log.warn('guest_push_rejected', { status: res.status });
      }
    } catch {
      log.warn('guest_push_error', {});
    }
  }

  if (sent > 0) {
    void (client as any).from('guest_push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('guest_session_id', input.sessionId)
      .eq('property_id', input.propertyId);
    return 'sent';
  }
  return 'failed';
}
