import { schedules, logger } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchIcalFeed, syncPropertyIcalFeed } from "@/lib/stays/ical-sync";

// iCal stay import (issue #133, item 4): hosts paste their Airbnb/Vrbo calendar
// export URL once; this poll keeps stays in sync — new reservations auto-create
// stays + access codes, date changes update, cancellations revoke. No platform
// API approval needed, and manual stay creation remains as fallback.
export const icalStaySync = schedules.task({
  id: "ical-stay-sync",
  cron: "*/30 * * * *",
  maxDuration: 300,
  run: async () => {
    const admin = createAdminClient();
    const { data: properties, error } = await (admin as any)
      .from("properties")
      .select("id, slug, host_account_id, ical_import_url")
      .not("ical_import_url", "is", null);
    if (error) throw error;

    const summary = { properties: 0, created: 0, updated: 0, revoked: 0, failures: 0 };
    for (const property of properties ?? []) {
      if (!property.ical_import_url) continue;
      summary.properties += 1;
      try {
        const feed = await fetchIcalFeed(property.ical_import_url as string);
        const result = await syncPropertyIcalFeed(admin, {
          id: property.id as string,
          slug: property.slug as string,
          host_account_id: property.host_account_id as string,
        }, feed);
        summary.created += result.created;
        summary.updated += result.updated;
        summary.revoked += result.revoked;
      } catch (feedError) {
        // One bad feed never takes down the rest of the fleet.
        summary.failures += 1;
        logger.warn("ical-stay-sync: property sync failed", {
          propertyId: property.id,
          error: feedError instanceof Error ? feedError.message : String(feedError),
        });
      }
    }
    logger.info("ical-stay-sync: complete", summary);
    return summary;
  },
});
