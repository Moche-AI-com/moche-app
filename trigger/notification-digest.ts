import { schedules, logger } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { senderFor } from "@/lib/mail/senders";
import { serverEnv, publicEnv } from "@/lib/env";

// Daily notification digest. notify() queues digest-eligible categories
// (extras, review nudges, property knowledge) for members who turned on the
// digest switch in Profile → Notifications; this task sends one grouped email
// per member each morning and marks the rows sent. Urgent and always-on paths
// never enter the queue, by construction in the category registry.
//
// Runs under Trigger.dev with the service client; needs NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and NEXT_PUBLIC_APP_URL present in
// the Trigger project env. Logs carry counts and ids only — never addresses or
// content (PII denylist, Section K).

interface QueueRow {
  id: string;
  host_account_id: string;
  profile_id: string;
  notification_id: string;
  created_at: string;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
}

// Exported standalone so unit tests can exercise the batching logic without the
// task wrapper, mirroring trigger/ping.ts.
export async function runNotificationDigest(): Promise<{ ok: boolean; sent: number; queued: number }> {
  if (!serverEnv.resendApiKey) {
    // Nothing is marked sent, so tomorrow's run retries the same rows.
    logger.warn("notification-digest: no Resend key, leaving rows queued");
    return { ok: false, sent: 0, queued: 0 };
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("notification_digest_queue")
    .select("id, host_account_id, profile_id, notification_id, created_at")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    logger.error("notification-digest: queue read failed", { error: error.message });
    return { ok: false, sent: 0, queued: 0 };
  }
  const pending = (rows ?? []) as unknown as QueueRow[];
  if (pending.length === 0) return { ok: true, sent: 0, queued: 0 };

  const { data: notifications } = await admin
    .from("notifications")
    .select("id, title, body, link, created_at")
    .in("id", Array.from(new Set(pending.map((r) => r.notification_id))));
  const notificationsById = new Map<string, NotificationRow>();
  for (const n of (notifications ?? []) as unknown as NotificationRow[]) notificationsById.set(n.id, n);

  const profileIds = Array.from(new Set(pending.map((r) => r.profile_id)));
  const { data: profiles } = await admin.from("profiles").select("id, email").in("id", profileIds);
  const emailByProfile = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; email: string | null }>) {
    if (p.email) emailByProfile.set(p.id, p.email);
  }

  const sender = senderFor("digest");
  const { Resend } = await import("resend");
  const resend = new Resend(serverEnv.resendApiKey);

  const byProfile = new Map<string, QueueRow[]>();
  for (const row of pending) {
    const list = byProfile.get(row.profile_id) ?? [];
    list.push(row);
    byProfile.set(row.profile_id, list);
  }

  let sent = 0;
  for (const [profileId, items] of byProfile) {
    const email = emailByProfile.get(profileId);
    if (!email) continue;
    const lines: string[] = [];
    for (const item of items) {
      const n = notificationsById.get(item.notification_id);
      if (!n) continue;
      lines.push(`• ${n.title}${n.body ? ` — ${n.body}` : ""}`);
      if (n.link) lines.push(`  ${publicEnv.appUrl}${n.link}`);
    }
    if (lines.length === 0) continue;
    const count = items.length;
    const text = [
      `Here ${count === 1 ? "is" : "are"} your ${count} update${count === 1 ? "" : "s"} from the last day:`,
      "",
      ...lines,
      "",
      `Manage what reaches you: ${publicEnv.appUrl}/dashboard/profile/notifications`,
    ].join("\n");
    const { error: sendError } = await resend.emails.send({
      from: sender.from,
      replyTo: sender.replyTo,
      to: email,
      subject: `Moche-AI daily digest — ${count} update${count === 1 ? "" : "s"}`,
      text,
    });
    if (sendError) {
      // Row stays pending — tomorrow's run retries it. Ids only in logs.
      logger.error("notification-digest: send failed", { profileId, error: sendError.message });
      continue;
    }
    await admin
      .from("notification_digest_queue")
      .update({ sent_at: new Date().toISOString() })
      .in("id", items.map((i) => i.id));
    sent += 1;
  }

  logger.info("notification-digest: run complete", { sent, queued: pending.length });
  return { ok: true, sent, queued: pending.length };
}

export const notificationDigestTask = schedules.task({
  id: "notification-digest",
  // 08:00 in the hosts' primary market timezone; the timezone form keeps the
  // send at local morning through DST shifts.
  cron: { pattern: "0 8 * * *", timezone: "America/New_York" },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    randomize: true,
  },
  run: async () => runNotificationDigest(),
});
