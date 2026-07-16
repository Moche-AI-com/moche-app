import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;
type NotificationKind = Database['public']['Enums']['notification_kind'];

interface NotifyParams {
  hostAccountId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  propertyId?: string | null;
  recipientProfileId?: string | null;
}

// Creates an in-app notification row. Email/SMS delivery (Resend/Twilio) is a Phase-2
// extension point — the notification row is the durable source of truth and is what
// the host dashboard reads.
export async function notify(client: Client, p: NotifyParams): Promise<void> {
  try {
    await client.from('notifications').insert({
      host_account_id: p.hostAccountId,
      kind: p.kind,
      title: p.title,
      body: p.body ?? null,
      link: p.link ?? null,
      property_id: p.propertyId ?? null,
      recipient_profile_id: p.recipientProfileId ?? null,
    });
    // TODO(phase-2): fan out to email (Resend) / SMS (Twilio) based on plan entitlements.
  } catch (e) {
    log.warn('notify_failed', { kind: p.kind, error: String(e) });
  }
}
