import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { sendNotificationReminder, type ReminderNotification, type ReminderStep } from '@/lib/notify';
import { quietHoursResumeAt } from '@/lib/notifications/quiet-hours';

// #195 PR 4: works through due notification_escalations steps. Runs inside the
// production Vercel deployment (SMS is only enabled there), invoked every
// minute by /api/cron/notification-escalations.
//
// Safety:
// - Each step is claimed with a compare-and-set (pending -> done) before any
//   send, so overlapping runs can never text twice.
// - Seen alerts, unknown steps and steps more than 2h overdue are cancelled,
//   never sent late.
// - Non-urgent reminders are held until quiet hours end in the property's time
//   zone. P1 always goes through.
// - One failing step never stops the rest of the batch.

type AdminClient = ReturnType<typeof createAdminClient>;
const db = (client: AdminClient) => client as any;

export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const BATCH = 50;
const SENDABLE: ReadonlySet<string> = new Set(['sms_15m', 'backup_30m', 'p1_repeat_5m', 'p1_backup_10m']);

type StepRow = { id: string; notification_id: string; step: string; due_at: string };

export type EscalationRunSummary = {
  due: number;
  sent: number;
  deferred: number;
  cancelled: number;
  raced: number;
  failed: number;
};

export async function runDueEscalations(client: AdminClient, now: Date = new Date()): Promise<EscalationRunSummary> {
  const summary: EscalationRunSummary = { due: 0, sent: 0, deferred: 0, cancelled: 0, raced: 0, failed: 0 };
  // Earliest-due first, so the batch always contains every step that is due
  // before any that are not.
  const { data: pending, error } = await db(client)
    .from('notification_escalations')
    .select('id, notification_id, step, due_at')
    .eq('status', 'pending')
    .order('due_at', { ascending: true })
    .limit(BATCH);
  if (error) throw new Error('escalation_query_failed');
  const due = ((pending ?? []) as StepRow[]).filter((s) => new Date(s.due_at).getTime() <= now.getTime());
  summary.due = due.length;

  for (const step of due) {
    try {
      const { data: claimed } = await db(client)
        .from('notification_escalations')
        .update({ status: 'done' })
        .eq('id', step.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (!claimed) {
        summary.raced++;
        continue;
      }
      const cancel = async () => {
        await db(client).from('notification_escalations').update({ status: 'cancelled' }).eq('id', step.id);
        summary.cancelled++;
      };
      if (!SENDABLE.has(step.step) || now.getTime() - new Date(step.due_at).getTime() > STALE_AFTER_MS) {
        await cancel();
        continue;
      }
      const { data: n } = await db(client)
        .from('notifications')
        .select('id, host_account_id, kind, link, property_id, recipient_profile_id, conversation_id, urgency, acknowledged_at')
        .eq('id', step.notification_id)
        .maybeSingle();
      if (!n || n.acknowledged_at) {
        await cancel();
        continue;
      }
      if (n.urgency !== 'p1' && n.property_id) {
        const { data: property } = await db(client)
          .from('properties')
          .select('timezone')
          .eq('id', n.property_id)
          .maybeSingle();
        const resume = quietHoursResumeAt((property?.timezone as string | null) ?? null, now);
        if (resume) {
          await db(client)
            .from('notification_escalations')
            .update({ status: 'pending', due_at: resume.toISOString() })
            .eq('id', step.id);
          summary.deferred++;
          continue;
        }
      }
      const result = await sendNotificationReminder(client, n as ReminderNotification, step.step as ReminderStep);
      summary.sent += result.sent;
    } catch (e) {
      summary.failed++;
      log.warn('notification_escalation_step_failed', {
        step: step.step,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }
  return summary;
}
