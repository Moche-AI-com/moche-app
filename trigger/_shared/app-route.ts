import { logger } from "@trigger.dev/sdk";

// Trigger.dev tasks in this repo are clocks only. Each one calls an
// authenticated /api/cron route on the production Vercel deployment, where the
// real work runs with Vercel's environment (Supabase credentials,
// GUEST_CONTACT_SALT, Twilio). Tasks must never import app code from lib/:
// those modules use `server-only` (which throws outside Next.js) and need
// production secrets. Enforced by test/trigger-clock-only.test.ts.
//
// Needs APP_URL (https, the final production host) and CRON_SECRET (same value
// as Vercel) in the Trigger.dev environment. The Trigger.dev Vercel
// integration syncs both from the Vercel project.

export async function callAppCronRoute(path: string, timeoutMs: number): Promise<unknown> {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const secret = process.env.CRON_SECRET || "";
  const hasUrl = appUrl.startsWith("https://");
  if (!hasUrl || !secret) {
    throw new Error(
      `${path}: set APP_URL (https) and CRON_SECRET in the Trigger.dev environment ` +
        `(APP_URL ${hasUrl ? "ok" : "missing"}, CRON_SECRET ${secret ? "ok" : "missing"})`,
    );
  }

  let res: Response;
  try {
    res = await fetch(new URL(path, appUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "Error";
    throw new Error(
      `${path}: could not reach the app (${name}). Check APP_URL is the final production host with no redirect (e.g. not a www redirect).`,
    );
  }

  const body = await res.json().catch(() => null);
  if (res.status === 404) {
    throw new Error(`${path}: 404. CRON_SECRET in Trigger.dev does not match Vercel, or the route is not deployed yet.`);
  }
  if (!res.ok) {
    throw new Error(`${path}: app route failed with ${res.status}`);
  }
  logger.info(`${path}: complete`, (body ?? {}) as Record<string, unknown>);
  return body;
}
