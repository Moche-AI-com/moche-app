import { schedules } from "@trigger.dev/sdk";
import { callAppCronRoute } from "./_shared/app-route";

// iCal stay import clock (issue #133, item 4). Hosts paste their Airbnb/Vrbo
// calendar export URL once; every 30 minutes this calls
// /api/cron/ical-sync on Vercel, which creates, updates and revokes stays.
// The sync itself runs in the app (see trigger/_shared/app-route.ts for why).
export const icalStaySync = schedules.task({
  id: "ical-stay-sync",
  cron: "*/30 * * * *",
  maxDuration: 120,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 60_000 },
  run: async () => callAppCronRoute("/api/cron/ical-sync", 70_000),
});
