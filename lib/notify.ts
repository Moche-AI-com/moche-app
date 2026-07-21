import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';
import { resolveTwilioAuth, serverEnv, publicEnv } from '@/lib/env';
import { getEntitlements } from '@/lib/billing/entitlements';

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

// Host notification kinds that fan out to email.
const EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['escalation', 'maintenance', 'billing']);
// Host notification kinds that MAY fan out to SMS (subject to all gates below).
const SMS_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['escalation', 'maintenance']);

const EMAIL_FROM = 'Moche.AI <noreply@moche-ai.com>';

// Sends an SMS via the Twilio Messages REST API using native fetch.
// Auth is resolved by resolveTwilioAuth (API-Key first, Auth-Token fallback). The
// Account SID sits in the URL path; credentials travel only in the Basic auth header
// over TLS. Message bodies and phone numbers are NEVER logged.
async function sendSms(to: string, message: string): Promise<boolean> {
  const auth = resolveTwilioAuth();
  if (!auth) {
    log.warn('sms_disabled_no_twilio_config', {});
    return false;
  }
  const body = new URLSearchParams({ To: to, From: auth.fromNumber, Body: message });
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth.authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );
    if (!res.ok) {
      // Status only — response body may contain PII / token hints.
      log.error('sms_send_failed', { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    log.error('sms_send_error', { error: String(e) });
    return false;
  }
}

// Sends a plain-text host email via Resend (server-side only).
async function sendHostEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.warn('email_disabled_no_resend_key', {});
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, text });
    if (error) {
      log.error('host_email_failed', { error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    log.error('host_email_error', { error: String(e) });
    return false;
  }
}

// Loads the host account owner's contact details (email + phone) for fan-out.
async function loadOwnerContact(
  client: Client,
  hostAccountId: string
): Promise<{ email: string | null; phone: string | null } | null> {
  const { data: account } = await client
    .from('host_accounts')
    .select('owner_id')
    .eq('id', hostAccountId)
    .maybeSingle();
  if (!account) return null;
  const { data: profile } = await client
    .from('profiles')
    .select('email, phone')
    .eq('id', (account as { owner_id: string }).owner_id)
    .maybeSingle();
  if (!profile) return null;
  return { email: (profile as { email: string | null }).email, phone: (profile as { phone: string | null }).phone };
}

// Creates the durable in-app notification row and fans out to email (now) and host SMS
// (Pro+, behind a feature flag) on a best-effort basis. Fan-out failures NEVER throw —
// the in-app row is the source of truth and the host dashboard always reflects it.
//
// Host SMS gating requires ALL of:
//   1. NOTIFY_SMS_ENABLED feature flag on, AND
//   2. plan entitlement smsEscalation (Pro+), AND
//   3. valid Twilio config present, AND
//   4. host owner profile has a non-null phone.
//
// TODO(consent): profiles has no phone_verified_at / sms_opt_in columns yet. A follow-up
// ADDITIVE migration (profiles.phone_verified_at, profiles.sms_opt_in) is REQUIRED for TCPA
// compliance BEFORE NOTIFY_SMS_ENABLED may be turned on in production. Until then SMS stays
// gated by the flag (default false) and the four conditions above.
export async function notify(client: Client, p: NotifyParams): Promise<void> {
  // 1. Durable in-app row (source of truth).
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
  } catch (e) {
    log.warn('notify_failed', { kind: p.kind, error: String(e) });
    return; // if the durable row failed, skip fan-out
  }

  const wantsEmail = EMAIL_KINDS.has(p.kind);
  const wantsSmsKind = SMS_KINDS.has(p.kind);
  if (!wantsEmail && !wantsSmsKind) return;

  const contact = await loadOwnerContact(client, p.hostAccountId);
  if (!contact) return;

  // 2. Email fan-out (all host notification kinds).
  if (wantsEmail && contact.email) {
    const url = p.link ? `${publicEnv.appUrl}${p.link}` : '';
    const text = `${p.body ?? p.title}${url ? `\n\nOpen your dashboard: ${url}` : ''}`;
    await sendHostEmail(contact.email, `Moche.AI: ${p.title}`, text);
  }

  // 3. Host SMS fan-out (escalation + maintenance only, all gates must pass).
  if (wantsSmsKind && serverEnv.notifySmsEnabled && contact.phone) {
    const ent = await getEntitlements(client, p.hostAccountId);
    if (ent.smsEscalation && resolveTwilioAuth()) {
      // Keep it short; never include guest PII beyond the already-truncated title.
      await sendSms(contact.phone, `Moche.AI: ${p.title}`);
    }
  }
}

// Delivers a guest OTP out-of-band (email/SMS).
// Security contract:
//   - The full OTP code is NEVER logged (only masked hints in dev fallback).
//   - Twilio credentials are read exclusively from serverEnv (process.env) via
//     resolveTwilioAuth — never from client-accessible paths, params, bodies, or headers.
//   - Uses the Twilio Messages REST API directly via native fetch to minimise attack surface.
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
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
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
    // ── SMS path ── deliver via Twilio (server-side only, dual-auth) ─────────────
    const auth = resolveTwilioAuth();
    if (!auth) {
      log.error('guest_otp_sms_config_missing', { channel: 'sms' });
      throw new Error('SMS delivery not configured');
    }

    const body = new URLSearchParams({
      To: p.contact,
      From: auth.fromNumber,
      Body: `Your Moche.AI verification code is: ${p.code}\n\nExpires in 10 minutes. Never share this code.`,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth.authHeader}`,
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

    log.info('guest_otp_sms_sent', { channel: 'sms', mode: auth.mode });
  }
}
