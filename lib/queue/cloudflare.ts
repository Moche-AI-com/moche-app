// Cloudflare Queues producer for candidate mining and event-driven ingestion (§8/§9).
//
// Push-only. The consumer is a Worker/pull consumer outside this repo, so nothing here
// acks, retries, or reads. Two stages share the same pipeline but never the same
// transport: mining goes to Cloudflare Queues, the approved brain write goes to the AWS
// worker in ./brain-write.ts. Keeping the producers separate is what stops a future
// "just enqueue it wherever" call from collapsing §8 and §9 into one stage.

import 'server-only';

import { serverEnv } from '@/lib/env';

const API_BASE = 'https://api.cloudflare.com/client/v4';

// Cloudflare's own documented ceiling for a single message body.
const MAX_BODY_BYTES = 128 * 1024;

const PUSH_TIMEOUT_MS = 5000;

export type MiningKind =
  | 'conversation_correction'
  | 'conversation_gap'
  | 'escalation_resolution'
  | 'listing_diff';

export interface MiningMessage {
  kind: MiningKind;
  property_id: string;
  /** Conversation/escalation/monitor row that produced this signal. */
  source_id: string;
  /** Idempotency key. The consumer dedupes on this; retries here are safe. */
  dedupe_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export type EnqueueOutcome =
  | { ok: true; queued: true }
  | { ok: false; queued: false; reason: 'not_configured' | 'too_large' | 'rejected' | 'unreachable'; detail?: string };

export function miningQueueConfigured(): boolean {
  return (
    serverEnv.cloudflareAccountId.length > 0 &&
    serverEnv.cloudflareQueuesToken.length > 0 &&
    serverEnv.cloudflareMiningQueueId.length > 0
  );
}

/**
 * Push one mining candidate. Never throws: a mining failure must not fail the guest
 * request that produced the signal, and it must not be retried inline either — the
 * caller logs the outcome and moves on. A dropped candidate costs one learning
 * opportunity; an inline retry costs the guest their answer latency.
 */
export async function enqueueMining(message: MiningMessage): Promise<EnqueueOutcome> {
  if (!miningQueueConfigured()) return { ok: false, queued: false, reason: 'not_configured' };

  const body = JSON.stringify({ body: message, content_type: 'json' });
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    // Truncating would produce a candidate the consumer cannot act on, which is worse
    // than dropping it, because it would look like a real candidate to a reviewer.
    return { ok: false, queued: false, reason: 'too_large' };
  }

  const url = `${API_BASE}/accounts/${serverEnv.cloudflareAccountId}/queues/${serverEnv.cloudflareMiningQueueId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.cloudflareQueuesToken}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, queued: false, reason: 'rejected', detail: `http_${res.status}` };
    }

    // Cloudflare returns HTTP 200 with success:false for some validation failures, so
    // the status code alone is not proof the message landed.
    const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (json && json.success === false) {
      return { ok: false, queued: false, reason: 'rejected', detail: 'success_false' };
    }
    return { ok: true, queued: true };
  } catch (err) {
    return {
      ok: false,
      queued: false,
      reason: 'unreachable',
      detail: err instanceof Error ? err.name : 'unknown',
    };
  }
}

/** Deterministic dedupe key so the same signal from the same turn enqueues once. */
export function miningDedupeKey(kind: MiningKind, propertyId: string, sourceId: string, fieldId?: string): string {
  return [kind, propertyId, sourceId, fieldId ?? '-'].join(':');
}
