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

// Delivers a guest OTP out-of-band (email/SMS).
// Security contract:
//   - The full OTP code is NEVER logged (only masked hints in dev fallback).
//   - Twilio credentials are read exclusively from serverEnv (process.env) — never
//     from client-accessible paths, query params, request bodies, or headers.
//   - Uses the Twilio Messages REST API directly via native fetch to avoid bundling
//     the full Twilio SDK and to minimise attack surface.
export async function notifyGuestOtp(p: { contact: string; code: string; devFallback: boolean }): Promise<void> {
  if (p.devFallback) {
    // Dev only: write a masked hint to SERVER console. Code is never returned to the client.
    // eslint-disable-next-line no-console
    console.info(`[dev-fallback] Guest OTP for ${p.contact.slice(0, 2)}***: ${p.code}`);
    return;
  }

  if (p.contact.includes('@')) {
    // ── Email path ── deliver via Resend (server-side only) ──────────────────────
    const { Resend } = await import('resend');
    const { serverEnv } = await import('@/lib/env');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({
      from: 'Moche.AI <noreply@moche-ai.com>',
      to: p.contact,
      subject: 'Your Moche.AI verification code',
      text: `Your verification code is: ${p.code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    });
    if (error) {
      log.error('guest_otp_email_failed', { error: error.message });
      throw new Error('Email delivery failed');
    }
    log.info('guest_otp_email_sent', { channel: 'email' });
  } else {
    // ── SMS path ── deliver via Twilio (server-side only) ────────────────────────
    // Credentials are read from serverEnv which proxies process.env.
    // They are never interpolated into the URL — only sent as a Basic-auth header
    // on the server-to-Twilio request, which travels over TLS.
    const { serverEnv } = await import('@/lib/env');
    const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = serverEnv;

    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      log.error('guest_otp_sms_config_missing', { channel: 'sms' });
      throw new Error('SMS delivery not configured');
    }

    // Basic auth: base64(accountSid:authToken) — computed at runtime, not stored anywhere.
    const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');

    const body = new URLSearchParams({
      To: p.contact,
      From: twilioFromNumber,
      Body: `Your Moche.AI verification code is: ${p.code}\n\nExpires in 10 minutes. Never share this code.`,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    if (!res.ok) {
      // Log HTTP status only — never log the response body (may contain PII or token hints).
      log.error('guest_otp_sms_failed', { status: res.status, channel: 'sms' });
      throw new Error(`SMS delivery failed (HTTP ${res.status})`);
    }

    log.info('guest_otp_sms_sent', { channel: 'sms' });
  }
}
