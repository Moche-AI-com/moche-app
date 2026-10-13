import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { hashRateKey } from '@/lib/crypto';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

export interface RateLimitParams {
  key: string;
  limit: number;
  windowSeconds: number;
  action?: string;
  /** Paid provider calls must fail closed if counting or recording fails. */
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// Supabase-backed fixed-window limiter. The raw subject key is hashed before
// storage. Existing callers remain fail-open; billable search opts in to strict.
export async function checkRateLimit(admin: Client, params: RateLimitParams): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = params;
  const action = params.action ?? 'rate_limit';
  const keyHash = hashRateKey(key);
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const denied = { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };

  const { count, error } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .eq('ip_hash', keyHash)
    .gte('created_at', sinceIso);

  if (error) {
    log.warn('rate_limit_count_failed', { action, error: error.message });
    return params.failClosed ? denied : { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }

  const used = count ?? 0;
  if (used >= limit) return denied;

  const { error: insertError } = await admin
    .from('audit_logs')
    .insert({ action, ip_hash: keyHash } as never);
  if (insertError) {
    log.warn('rate_limit_record_failed', { action, error: insertError.message });
    if (params.failClosed) return denied;
  }
  return { allowed: true, remaining: Math.max(0, limit - used - 1), retryAfterSeconds: 0 };
}
