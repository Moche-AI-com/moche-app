import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { buildVapidJwt, encryptPushPayload, isPushConfigured } from './push';

function testVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const priv = privateKey.export({ format: 'jwk' }) as { d: string };
  const rawPublic = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x, 'base64url'),
    Buffer.from(pub.y, 'base64url'),
  ]);
  return { publicKey: rawPublic.toString('base64url'), privateKey: priv.d };
}

function testSubscriptionKeys() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const p256dh = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x, 'base64url'),
    Buffer.from(pub.y, 'base64url'),
  ]).toString('base64url');
  return { p256dh, auth: randomBytes(16).toString('base64url') };
}

describe('isPushConfigured', () => {
  it('is false without VAPID env vars (feature ships dark)', () => {
    expect(isPushConfigured()).toBe(false);
  });
});

describe('buildVapidJwt', () => {
  it('builds a signed ES256 JWT with aud/exp/sub claims', () => {
    const keys = testVapidKeys();
    const jwt = buildVapidJwt('https://fcm.googleapis.com/fcm/send/abc123', keys);
    const [header, payload, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toContain('mailto:');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(signature.length).toBeGreaterThan(40);
  });

  it('rejects a malformed public key', () => {
    expect(() => buildVapidJwt('https://example.com/push', { publicKey: 'c2hvcnQ', privateKey: 'c2hvcnQ' })).toThrow();
  });
});

describe('encryptPushPayload', () => {
  it('produces an aes128gcm body with salt, record size, and ephemeral key header', () => {
    const sub = testSubscriptionKeys();
    const body = encryptPushPayload(sub.p256dh, sub.auth, JSON.stringify({ title: 'Moche-AI', body: 'Your host replied.' }));
    // 16 salt + 4 rs + 1 idlen + 65 ephemeral key + ciphertext + 16-byte GCM tag.
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65 + 16);
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(body[20]).toBe(65);
  });

  it('rejects a malformed subscription key', () => {
    expect(() => encryptPushPayload('c2hvcnQ', randomBytes(16).toString('base64url'), '{}')).toThrow();
  });
});
