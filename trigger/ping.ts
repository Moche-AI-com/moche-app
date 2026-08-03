import { task, logger } from "@trigger.dev/sdk";

// PR #4 — Trigger.dev foundation. This is the one trivial task used to prove
// out the SDK wiring (trigger → run → retry → complete) before real jobs
// (WS-7 AI triage, Brain ingestion, notification fan-out) are added in later
// PRs. Payload carries no PII, per Section K of the approved plan.

export interface PingPayload {
  message?: string;
  /**
   * When true, the run intentionally throws on its first attempt so the
   * retry path can be verified end-to-end via the dashboard/logs, then
   * succeeds on attempt 2. Never set true outside of manual verification.
   */
  testRetry?: boolean;
}

// Exported standalone so unit tests can call the branching logic directly
// without going through the real Task wrapper (which has no public `.run`).
export async function runPing(payload: PingPayload, { ctx }: { ctx: { attempt: { number: number } } }) {
  if (payload.testRetry && ctx.attempt.number < 2) {
    logger.warn(`ping: intentional failure on attempt ${ctx.attempt.number} (testRetry mode)`);
    throw new Error(`Intentional test failure on attempt ${ctx.attempt.number}`);
  }

  logger.info(`ping: succeeded on attempt ${ctx.attempt.number}`, {
    message: payload.message ?? null,
  });

  return {
    ok: true as const,
    attempt: ctx.attempt.number,
    receivedAt: new Date().toISOString(),
  };
}

export const pingTask = task({
  id: "ping",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true,
  },
  run: runPing,
});
