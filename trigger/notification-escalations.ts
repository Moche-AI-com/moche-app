import { schedules, logger } from "@trigger.dev/sdk";

// #195 PR 4: per-minute clock for the reminder ladder. SMS can only be sent
// from the production Vercel deployment (lib/env smsDeliveryEnabled requires
// VERCEL_ENV=production), so this task does no work itself: it calls the
// authenticated /api/cron/notification-escalations route, which claims and
// sends due steps. Claims are compare-and-set, so a retried or overlapping
// run never double-texts.
//
// Requires APP_URL (https) and CRON_SECRET in the Trigger.dev environment.
export const notificationEscalations = schedules.task({
  id: "notification-escalations",
  cron: "* * * * *",
  maxDuration: 60,
  run: async () => {
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    if (!appUrl.startsWith("https://") || !secret) {
      logger.error("notification-escalations: set APP_URL (https) and CRON_SECRET in the Trigger.dev environment");
      return { ok: false, reason: "not_configured" };
    }
    const res = await fetch(new URL("/api/cron/notification-escalations", appUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      logger.error("notification-escalations: run failed", { status: res.status });
      throw new Error(`notification-escalations run failed: ${res.status}`);
    }
    logger.info("notification-escalations: complete", body ?? {});
    return body;
  },
});
