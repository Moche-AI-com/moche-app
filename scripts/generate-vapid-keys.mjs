// Generates a VAPID keypair for guest web-push (RFC 8292). Run locally:
//
//   node scripts/generate-vapid-keys.mjs
//
// Then set NEXT_PUBLIC_VAPID_PUBLIC_KEY (browser-safe) and VAPID_PRIVATE_KEY
// (server-only) in the environment. Never commit real values; rotating the
// pair invalidates existing browser subscriptions (they re-subscribe on next
// portal visit).
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

// The public key browsers expect is the 65-byte uncompressed point: 0x04 || x || y.
const rawPublic = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(pub.x, 'base64url'),
  Buffer.from(pub.y, 'base64url'),
]);

console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + rawPublic.toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + priv.d);
