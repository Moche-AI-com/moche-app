import 'server-only';
import { isProductionRuntime, resolveTwilioAuth, serverEnv } from '@/lib/env';
import { normalizeSmsPhone } from '@/lib/notifications/phone';
import { isSmsSuppressed } from '@/lib/notifications/sms-suppression';
import type { SmsFailureReason } from '@/lib/notifications/delivery-outcome';

// Called only AFTER a host-initiated SMS failed, to tell the host why instead of
// a generic error. Mirrors the gates in lib/notify.ts sendSms(), in order.
// Never logs or returns the phone number.
export async function diagnoseSmsFailure(
  client: Parameters<typeof isSmsSuppressed>[0],
  to: string,
): Promise<SmsFailureReason> {
  const phone = normalizeSmsPhone(to);
  if (!phone) return 'invalid_phone';
  if (!isProductionRuntime() || !serverEnv.smsDeliveryEnabled || !resolveTwilioAuth()) return 'sms_disabled';
  try {
    if (await isSmsSuppressed(client, phone)) return 'opted_out';
  } catch {
    // Fall through: an unreadable suppression list is reported as a send failure.
  }
  return 'provider_failed';
}
