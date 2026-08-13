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

// Membership is tested with literal `===` comparisons rather than a Set or an array,
// because `Set.prototype.has` and `Array.prototype.includes` are replaceable at runtime
// and a replaced one can approve a value it never saw. `===` on a string literal invokes
// nothing. That matters here specifically because these two values are copied onto a wire
// that leaves our infrastructure.
function isMiningSignal(value: string): value is MiningSignal {
  return (
    value === 'guest_contradicted_stored_value' ||
    value === 'no_stored_value' ||
    value === 'stored_value_expired' ||
    value === 'host_resolved_escalation' ||
    value === 'listing_changed'
  );
}

function isMiningKind(value: string): value is MiningKind {
  return (
    value === 'conversation_correction' ||
    value === 'conversation_gap' ||
    value === 'escalation_resolution' ||
    value === 'listing_diff'
  );
}

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

const EPOCH_DAYS_TO_1970 = 719468;

/**
 * Formats an epoch-millisecond value as an ISO-8601 instant using only integer arithmetic
 * and string padding on primitives.
 *
 * `Date.prototype.toISOString` would be the obvious call, and in an ordinary code path it
 * would be the right one. It is avoided here for the same reason `Set.prototype.has` is:
 * the result of this function is copied onto a wire that leaves our infrastructure, and a
 * replaced prototype method may return a value the validator never approved. Arithmetic
 * cannot be replaced.
 *
 * Civil-date conversion follows Howard Hinnant's days_from_civil inverse.
 */
function isoFromEpoch(epochMs: number): string {
  const totalMs = Math.trunc(epochMs);
  const msPerDay = 86400000;
  // Floor division, so pre-1970 instants carry a negative day count and a positive time.
  const days = Math.floor(totalMs / msPerDay);
  const msOfDay = totalMs - days * msPerDay;

  const z = days + EPOCH_DAYS_TO_1970;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);

  const hours = Math.floor(msOfDay / 3600000);
  const minutes = Math.floor((msOfDay % 3600000) / 60000);
  const seconds = Math.floor((msOfDay % 60000) / 1000);
  const millis = msOfDay % 1000;

  const pad = (value: number, width: number): string => {
    let out = `${value}`;
    while (out.length < width) out = `0${out}`;
    return out;
  };

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}Z`;
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
  if (kind === null || !isMiningKind(kind)) return { ok: false, detail: 'kind' };

  const signal = snapshotString(message.signal);
  if (signal === null || !isMiningSignal(signal)) return { ok: false, detail: 'signal' };

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

  const wire: MiningWireMessage = {
      kind,
      property_id: propertyId,
      source_id: sourceId,
      // Derived, never accepted. A caller-supplied dedupe key was the last free-text
      // member of this message, and it is a pure function of the other fields anyway, so
      // accepting one bought nothing while leaving a channel no format check can police.
      dedupe_key: miningDedupeKey(kind, propertyId, sourceId, fieldId),
      // Re-emitted from the parsed epoch rather than copied: Date.parse accepts a bare
      // number as a year, so `4821` validates as a timestamp and would otherwise reach the
      // queue verbatim. Formatted from integer arithmetic rather than
      // `Date.prototype.toISOString`, which is replaceable and would then be free to
      // return anything.
      occurred_at: isoFromEpoch(parsed),
      signal,
      ...(fieldId === undefined ? {} : { field_id: fieldId }),
  };

  // Final sweep: every member must be a primitive string before this leaves the function.
  // The two derived members are built from validated primitives, so this should be
  // unreachable — which is the point. It is the assertion that the guarantee this function
  // advertises actually held, rather than a claim that it did.
  for (const key of Object.keys(wire)) {
    if (typeof (wire as unknown as Record<string, unknown>)[key] !== 'string') return { ok: false, detail: key };
  }

  return { ok: true, wire };
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
  // Concatenated rather than joined: `Array.prototype.join` is replaceable at runtime, and
  // this string is copied onto an outbound wire. Template concatenation of four strings
  // calls nothing.
  return `${kind}:${propertyId}:${sourceId}:${fieldId ?? '-'}`;
}
