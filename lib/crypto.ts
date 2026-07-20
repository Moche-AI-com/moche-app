import 'server-only';
import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
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

// --- Session tokens ------------------------------------------------------

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return sha256(`session:${token}`);
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
