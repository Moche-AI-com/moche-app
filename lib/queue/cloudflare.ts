// Cloudflare Queues producer for candidate mining and event-driven ingestion (§8/§9).
//
// Push-only. The consumer is a Worker/pull consumer outside this repo, so nothing here
// acks, retries, or reads. Two stages share the same pipeline but never the same
// transport: mining goes to Cloudflare Queues, the approved brain write goes to the AWS
// worker in ./brain-write.ts. Keeping the producers separate is what stops a future
// "just enqueue it wherever" call from collapsing §8 and §9 into one stage.

import 'server-only';

import { serverEnv } from '@/lib/env';
import { REGISTRY_FIELDS } from '@/lib/brain/completeness';

const API_BASE = 'https://api.cloudflare.com/client/v4';

// Cloudflare's own documented ceiling for a single message body.
const MAX_BODY_BYTES = 128 * 1024;

const PUSH_TIMEOUT_MS = 5000;

export type MiningKind =
  | 'conversation_correction'
  | 'conversation_gap'
  | 'escalation_resolution'
  | 'listing_diff';

/**
 * Why the signal was raised. An enum rather than free text because the consumer
 * branches on it, and because an enum cannot carry a fact value.
 */
export type MiningSignal =
  | 'guest_contradicted_stored_value'
  | 'no_stored_value'
  | 'stored_value_expired'
  | 'host_resolved_escalation'
  | 'listing_changed';

/**
 * Identifiers only. There is deliberately no free-form payload: this message crosses
 * into a third-party queue, and the corpus it is mined from demonstrably contains door
 * codes and WiFi passwords. The consumer re-reads `source_id` under its own
 * authorization, so it needs a pointer, never the content. `enqueueMining` rebuilds the
 * wire object field by field, so a caller that casts past this type still cannot smuggle
 * an extra key onto the queue.
 */
export interface MiningMessage {
  kind: MiningKind;
  property_id: string;
  /** Conversation/escalation/monitor row that produced this signal. */
  source_id: string;
  /** Idempotency key. The consumer dedupes on this; retries here are safe. */
  dedupe_key: string;
  occurred_at: string;
  /** Registry field the signal concerns, when the signal is field-specific. */
  field_id?: string;
  signal: MiningSignal;
}

export type EnqueueOutcome =
  | { ok: true; queued: true }
  | {
      ok: false;
      queued: false;
      reason: 'not_configured' | 'invalid' | 'too_large' | 'rejected' | 'unreachable';
      detail?: string;
    };

const MINING_SIGNALS: ReadonlySet<string> = new Set<MiningSignal>([
  'guest_contradicted_stored_value',
  'no_stored_value',
  'stored_value_expired',
  'host_resolved_escalation',
  'listing_changed',
]);

const MINING_KINDS: ReadonlySet<string> = new Set<MiningKind>([
  'conversation_correction',
  'conversation_gap',
  'escalation_resolution',
  'listing_diff',
]);

const REGISTRY_FIELD_IDS: ReadonlySet<string> = new Set(REGISTRY_FIELDS.map((f) => f.field_id));

// Identifiers are uuids, short slugs, or colon-joined dedupe keys. The cap is what makes
// this a real constraint: a bounded id-shaped string cannot hold a WiFi password or a
// sentence of guest text, so smuggling content through an id field fails validation
// rather than being caught by review later.
const ID_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;

/**
 * Rejects anything that is not an identifier-shaped message. Returns a reason string on
 * failure so the caller can log which constraint failed without logging the value.
 */
export function validateMiningMessage(message: MiningMessage): string | null {
  if (!MINING_KINDS.has(message.kind)) return 'kind';
  if (!MINING_SIGNALS.has(message.signal)) return 'signal';
  if (!ID_PATTERN.test(message.property_id)) return 'property_id';
  if (!ID_PATTERN.test(message.source_id)) return 'source_id';
  if (!ID_PATTERN.test(message.dedupe_key)) return 'dedupe_key';
  if (message.field_id !== undefined && !REGISTRY_FIELD_IDS.has(message.field_id)) return 'field_id';
  if (Number.isNaN(Date.parse(message.occurred_at))) return 'occurred_at';
  return null;
}

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

  const invalid = validateMiningMessage(message);
  if (invalid) return { ok: false, queued: false, reason: 'invalid', detail: invalid };

  // Rebuilt field by field rather than passing `message` through. Spreading or
  // serializing the caller's object would put any extra property on the wire, which is
  // how an ids-only transport quietly becomes a content transport.
  const wire: MiningMessage = {
    kind: message.kind,
    property_id: message.property_id,
    source_id: message.source_id,
    dedupe_key: message.dedupe_key,
    occurred_at: message.occurred_at,
    signal: message.signal,
    ...(message.field_id === undefined ? {} : { field_id: message.field_id }),
  };

  const body = JSON.stringify({ body: wire, content_type: 'json' });
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
