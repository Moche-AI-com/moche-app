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
  /** Database uuid. */
  property_id: string;
  /** Conversation/escalation/monitor row uuid that produced this signal. */
  source_id: string;
  occurred_at: string;
  /** Registry field the signal concerns, when the signal is field-specific. */
  field_id?: string;
  signal: MiningSignal;
}

/** What actually goes on the wire: the message plus a dedupe key we derive, not accept. */
export type MiningWireMessage = MiningMessage & { dedupe_key: string };

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

// Every free-typed member of this message is a database uuid, so the validator demands a
// uuid rather than a general "id-shaped string". A length-capped charset pattern was the
// first attempt and it was not enough: `4821` and `hunter2` are both id-shaped, so a
// door code or a password could still ride out on an id field. A uuid has a fixed
// length, fixed hyphen positions, and a hex-only alphabet, which no human-chosen secret
// satisfies by accident.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads one member exactly once and returns it only if it is already a primitive string.
 *
 * This is the load-bearing step, not the pattern match. Validating the caller's object and
 * then serializing that same object reads every member twice, and a member does not have
 * to answer the same way both times: a getter can return a uuid to the validator and a
 * password to `JSON.stringify`, and an object with `toString`/`toJSON` can satisfy
 * `RegExp.test` by coercion while serializing as something else entirely. Snapshotting to
 * primitives first means validation and serialization are guaranteed to see the same
 * bytes, because after this returns there is no caller code left to run.
 */
function snapshotString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Validates and snapshots in one pass. Returns the exact object that will be serialized,
 * built only from primitives already checked, or the name of the field that failed so the
 * caller can log which constraint broke without logging the value.
 *
 * The two responsibilities are deliberately not separable. A validate-then-build split is
 * what allowed a caller to present different values to each step.
 */
export function normalizeMiningMessage(
  message: MiningMessage,
): { ok: true; wire: MiningWireMessage } | { ok: false; detail: string } {
  const kind = snapshotString(message.kind);
  if (kind === null || !MINING_KINDS.has(kind as MiningKind)) return { ok: false, detail: 'kind' };

  const signal = snapshotString(message.signal);
  if (signal === null || !MINING_SIGNALS.has(signal as MiningSignal)) {
    return { ok: false, detail: 'signal' };
  }

  const propertyId = snapshotString(message.property_id);
  if (propertyId === null || !UUID_PATTERN.test(propertyId)) return { ok: false, detail: 'property_id' };

  const sourceId = snapshotString(message.source_id);
  if (sourceId === null || !UUID_PATTERN.test(sourceId)) return { ok: false, detail: 'source_id' };

  let fieldId: string | undefined;
  if (message.field_id !== undefined) {
    const snapshot = snapshotString(message.field_id);
    if (snapshot === null || !REGISTRY_FIELD_IDS.has(snapshot)) return { ok: false, detail: 'field_id' };
    fieldId = snapshot;
  }

  const occurredAt = snapshotString(message.occurred_at);
  if (occurredAt === null) return { ok: false, detail: 'occurred_at' };
  const parsed = Date.parse(occurredAt);
  if (Number.isNaN(parsed)) return { ok: false, detail: 'occurred_at' };

  return {
    ok: true,
    wire: {
      kind: kind as MiningKind,
      property_id: propertyId,
      source_id: sourceId,
      // Derived, never accepted. A caller-supplied dedupe key was the last free-text
      // member of this message, and it is a pure function of the other fields anyway, so
      // accepting one bought nothing while leaving a channel no format check can police.
      dedupe_key: miningDedupeKey(kind as MiningKind, propertyId, sourceId, fieldId),
      // Re-emitted from the parsed instant rather than copied: Date.parse accepts a bare
      // number as a year, so `4821` validates as a timestamp and would otherwise reach the
      // queue verbatim.
      occurred_at: new Date(parsed).toISOString(),
      signal: signal as MiningSignal,
      ...(fieldId === undefined ? {} : { field_id: fieldId }),
    },
  };
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

  // One pass that validates and snapshots. `wire` holds only primitives, so nothing the
  // caller controls runs again between here and serialization.
  const normalized = normalizeMiningMessage(message);
  if (!normalized.ok) return { ok: false, queued: false, reason: 'invalid', detail: normalized.detail };
  const { wire } = normalized;

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
