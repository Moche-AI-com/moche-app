import 'server-only';
import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

// --- Contact normalization + hashing -------------------------------------
// Guests are looked up by a salted sha256 of their normalized contact.
// The raw contact is never stored; only the hash + last-4 for display.

export function normalizeContact(raw: string): { value: string; type: 'email' | 'phone' } {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.includes('@')) {
    return { value: trimmed, type: 'email' };
  }
  // Phone: strip everything but digits and a leading +.
  const digits = trimmed.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return { value: digits, type: 'phone' };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Salted hash of a normalized guest contact. Salt is a server secret.
export function hashContact(rawContact: string): { contactHash: string; type: 'email' | 'phone'; last4: string } {
  const { value, type } = normalizeContact(rawContact);
  const contactHash = sha256(`${serverEnv.guestContactSalt}:${value}`);
  const last4 = value.slice(-4);
  return { contactHash, type, last4 };
}

// --- OTP -----------------------------------------------------------------

export function generateOtp(): string {
  // 6-digit numeric, cryptographically random.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string, contactHash: string): string {
  // Bind the OTP hash to the contact so a leaked hash can't be replayed elsewhere.
  return sha256(`${serverEnv.guestContactSalt}:otp:${contactHash}:${code}`);
}

export function verifyOtp(code: string, contactHash: string, storedHash: string): boolean {
  return safeEqualHex(hashOtp(code, contactHash), storedHash);
}

// --- Guest visit codes (WS-1) ---------------------------------------------
// 4-digit second factor on a stay link. Bound to the issuing link id (not the
// guest contact — there is no contact on this flow) so a leaked hash can't be
// replayed against a different link.

export function generateVisitCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

export function hashVisitCode(code: string, linkId: string): string {
  return sha256(`${serverEnv.guestContactSalt}:visit-code:${linkId}:${code}`);
}

export function verifyVisitCode(code: string, linkId: string, storedHash: string): boolean {
  return safeEqualHex(hashVisitCode(code, linkId), storedHash);
}

// --- Session tokens ------------------------------------------------------

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return sha256(`session:${token}`);
}

// --- Member invitations ---------------------------------------------------
// The raw token has 256 bits of entropy and is emailed once; the database stores
// only this SHA-256 digest so a database export cannot redeem an invitation.

export function generateMemberInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashMemberInviteToken(token: string): string {
  return sha256(token);
}

// --- IP hashing ----------------------------------------------------------
// We only ever persist hashed IPs (for rate limiting + audit), never raw.

export function hashIp(ip: string): string {
  return sha256(`${serverEnv.guestContactSalt}:ip:${ip}`);
}

// Salted hash for arbitrary rate-limit keys (IPs, session tokens, property ids…).
// Uses the same namespace as hashIp so existing IP-keyed counters stay continuous.
export function hashRateKey(key: string): string {
  return sha256(`${serverEnv.guestContactSalt}:ip:${key}`);
}

// --- Constant-time compare ----------------------------------------------

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// --- HMAC-signed, single-purpose tokens ----------------------------------
// Used for the escalation "answer without login" magic link and the trusted-device
// second-factor cookie. Keyed by a server secret (guestContactSalt, namespaced) so
// tokens cannot be forged client-side. Payloads are non-secret; the HMAC is the guard.

function hmac(namespace: string, payload: string): string {
  return createHmac('sha256', `${serverEnv.guestContactSalt}:${namespace}`).update(payload).digest('hex');
}

// Mints a 15-minute token scoped to exactly one escalation. The token is opaque to the
// client and reveals nothing beyond an id it already cannot act on without a valid HMAC.
export function signEscalationLinkToken(escalationId: string, ttlMinutes = 15): string {
  const exp = Date.now() + ttlMinutes * 60 * 1000;
  const nonce = randomBytes(9).toString('base64url');
  const payload = `${escalationId}.${exp}.${nonce}`;
  const sig = hmac('escalation-link', payload);
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

// Verifies an escalation magic-link token. Returns the escalationId only if the HMAC
// matches (constant-time) and the token has not expired. Never throws; never logs.
export function verifyEscalationLinkToken(token: string): { escalationId: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = hmac('escalation-link', payload);
  if (!safeEqualHex(sig, expected)) return null;
  const [escalationId, expStr] = payload.split('.');
  if (!escalationId || !expStr) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { escalationId };
}

// --- Trusted-device second-factor cookie ---------------------------------
// After a host clears the SMS OTP login challenge we set an httpOnly cookie proving the
// second factor for this device. Value is an HMAC of the user id (no PII, unforgeable).

export function signTrustedDeviceValue(userId: string): string {
  return hmac('2fa-device', userId);
}

export function verifyTrustedDeviceValue(userId: string, value: string | undefined): boolean {
  if (!value) return false;
  return safeEqualHex(value, signTrustedDeviceValue(userId));
}
