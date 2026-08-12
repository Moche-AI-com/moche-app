// Brain-write dispatch (§9): approved candidates become brain_values rows on a
// background worker, never synchronously inside a guest-facing request.
//
// The load-bearing rule is the one that is easy to erode later: when the worker is not
// available, a guest-path caller must NOT fall back to writing inline. §9.0a forbids
// degrading a guest conversation silently, and an inline write on the request path is
// exactly that degradation wearing a helpful face. Host-initiated writes (the host tapped
// "Always true here" and is watching a spinner) may run inline, because there the latency
// is visible, expected, and attributable.

import 'server-only';

import { serverEnv } from '@/lib/env';

const DISPATCH_TIMEOUT_MS = 5000;

export type WriteOrigin = 'guest_conversation' | 'host_initiated' | 'scheduled_sweep';

export interface BrainWriteJob {
  property_id: string;
  field_id: string;
  /** Candidate row awaiting promotion. The worker re-reads it; nothing sensitive travels. */
  candidate_id: string;
  /** Row this write supersedes, if any. Versioning is the worker's job, not the caller's. */
  supersedes_id: string | null;
  origin: WriteOrigin;
  requested_at: string;
}

export type DispatchOutcome =
  | { channel: 'worker'; dispatched: true }
  | { channel: 'inline_allowed'; dispatched: false; reason: 'worker_disabled' }
  | { channel: 'refused'; dispatched: false; reason: 'worker_unavailable_on_guest_path' | 'dispatch_failed'; detail?: string };

export function brainWriteWorkerConfigured(): boolean {
  return (
    serverEnv.brainWriteWorkerEnabled &&
    serverEnv.brainWriteWorkerUrl.length > 0 &&
    serverEnv.brainWriteWorkerSecret.length > 0
  );
}

/**
 * Route a brain write to the background worker.
 *
 * `inline_allowed` is only ever returned for origins where a human is waiting on the
 * result. For `guest_conversation` the answer is `refused`, and the caller's only correct
 * response is to leave the candidate queued for host review — not to write it.
 */
export async function dispatchBrainWrite(job: BrainWriteJob): Promise<DispatchOutcome> {
  if (!brainWriteWorkerConfigured()) {
    if (job.origin === 'guest_conversation') {
      return { channel: 'refused', dispatched: false, reason: 'worker_unavailable_on_guest_path' };
    }
    return { channel: 'inline_allowed', dispatched: false, reason: 'worker_disabled' };
  }

  try {
    const res = await fetch(serverEnv.brainWriteWorkerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Shared secret, not a bearer identity: the worker is ours and has no user scope.
        'X-Moche-Worker-Secret': serverEnv.brainWriteWorkerSecret,
      },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      return { channel: 'refused', dispatched: false, reason: 'dispatch_failed', detail: `http_${res.status}` };
    }
    return { channel: 'worker', dispatched: true };
  } catch (err) {
    return {
      channel: 'refused',
      dispatched: false,
      reason: 'dispatch_failed',
      detail: err instanceof Error ? err.name : 'unknown',
    };
  }
}
