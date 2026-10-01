import { schedules } from "@trigger.dev/sdk";
import { callAppCronRoute } from "./_shared/app-route";

// #195 PR 4: per-minute clock for the reminder ladder. SMS can only be sent
// from the production Vercel deployment (lib/env smsDeliveryEnabled requires
// VERCEL_ENV=production), so this only calls
// /api/cron/notification-escalations, which claims and sends due steps.
// Claims are compare-and-set, so overlapping runs never double-text, and the
// next minute's run is the retry.
export const notificationEscalations = schedules.task({
  id: "notification-escalations",
  cron: "* * * * *",
  maxDuration: 60,
  retry: { maxAttempts: 1 },
  run: async () => callAppCronRoute("/api/cron/notification-escalations", 55_000),
});
