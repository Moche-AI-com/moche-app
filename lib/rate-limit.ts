import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { hashRateKey } from '@/lib/crypto';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

export interface RateLimitParams {
  // The subject being limited (raw IP, session token, property id…). ALWAYS hashed before storage.
  key: string;
  // Max allowed events within the window.
  limit: number;
  // Window length in seconds (fixed window).
  windowSeconds: number;
  // Logical bucket, stored in audit_logs.action so different limiters don't collide.
  action?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// Supabase-backed fixed-window rate limiter. No Upstash/Redis dependency: it reuses the
// audit_logs table (action + ip_hash + created_at) — the same pattern already used for the
// guest OTP per-IP cap. The subject key is hashed (never stored raw).
//
// Semantics: counts prior events for (action, hashedKey) within the window. If the count is
// already at/over the limit, the request is rejected WITHOUT recording a new event. Otherwise
// the event is recorded and the request is allowed. Fail-open on a counter read error so a
// transient DB issue never hard-blocks legitimate traffic (the count query is the guard, the
// insert is best-effort).
export async function checkRateLimit(admin: Client, params: RateLimitParams): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = params;
  const action = params.action ?? 'rate_limit';
  const keyHash = hashRateKey(key);
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .eq('ip_hash', keyHash)
    .gte('created_at', sinceIso);

  if (error) {
    log.warn('rate_limit_count_failed', { action, error: error.message });
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }

  const used = count ?? 0;
  if (used >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
  }

  // Record this event (best-effort; a failed insert must not reject the caller).
  const { error: insertError } = await admin
    .from('audit_logs')
    .insert({ action, ip_hash: keyHash } as never);
  if (insertError) {
    log.warn('rate_limit_record_failed', { action, error: insertError.message });
  }

  return { allowed: true, remaining: Math.max(0, limit - used - 1), retryAfterSeconds: 0 };
}
