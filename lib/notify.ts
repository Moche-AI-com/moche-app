import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';
import { resolveTwilioAuth, serverEnv, publicEnv } from '@/lib/env';
import { getEntitlements } from '@/lib/billing/entitlements';
import { TRANSACTIONAL_SENDER } from '@/lib/mail/senders';

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
  // Optional absolute URL delivered in the email + SMS fan-out (e.g. an escalation
  // answer magic link). Kept short for SMS. Never logged.
  actionUrl?: string;
}

// Host notification kinds that fan out to email.
// 'system' added for WS-1 visit-code lockout alerts (repeated failed attempts).
const EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['escalation', 'maintenance', 'billing', 'system']);
// Host notification kinds that MAY fan out to SMS (subject to all gates below).
const SMS_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>(['escalation', 'maintenance']);

// Every send site below is transactional (escalation, maintenance, billing, system,
// guest OTP), so it uses the monitored identity. The digest identity lives in
// lib/mail/senders and is deliberately not reachable from here — see §0.2 row 6.
const EMAIL_FROM = TRANSACTIONAL_SENDER.from;
const EMAIL_REPLY_TO = TRANSACTIONAL_SENDER.replyTo;

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
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to,
      subject,
      text,
    });
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

// Sends a plain-text email to our internal business inbox (product feedback pings, ops
// follow-ups). Best-effort and non-blocking: returns false and logs a warning if Resend
// is not configured or the send fails. The recipient is serverEnv.feedbackInbox and is
// never a guest/host-controlled address, so this is not a spam vector.
export async function sendInternalEmail(subject: string, text: string): Promise<boolean> {
  const to = serverEnv.feedbackInbox;
  if (!to) {
    log.warn('internal_email_no_inbox', {});
    return false;
  }
  return sendHostEmail(to, subject, text);
}

// Loads the host account owner's contact details (email + phone) for fan-out.
async function loadOwnerContact(
  client: Client,
  hostAccountId: string
): Promise<{ email: string | null; phone: string | null; smsOptIn: boolean; phoneVerifiedAt: string | null } | null> {
  const { data: account } = await client
    .from('host_accounts')
    .select('owner_id')
    .eq('id', hostAccountId)
    .maybeSingle();
  if (!account) return null;
  const { data: profile } = await client
    .from('profiles')
    .select('email, phone, sms_opt_in, phone_verified_at')
    .eq('id', (account as { owner_id: string }).owner_id)
    .maybeSingle();
  if (!profile) return null;
  const row = profile as { email: string | null; phone: string | null; sms_opt_in: boolean; phone_verified_at: string | null };
  return { email: row.email, phone: row.phone, smsOptIn: !!row.sms_opt_in, phoneVerifiedAt: row.phone_verified_at };
}

// Creates the durable in-app notification row and fans out to email (now) and host SMS
// (Pro+, behind a feature flag) on a best-effort basis. Fan-out failures NEVER throw —
// the in-app row is the source of truth and the host dashboard always reflects it.
//
// Host SMS gating requires ALL of:
//   1. NOTIFY_SMS_ENABLED feature flag on, AND
//   2. plan entitlement smsEscalation (Pro+), AND
//   3. valid Twilio config present, AND
//   4. host owner profile has a non-null phone that is VERIFIED (phone_verified_at) AND
//      an active TCPA opt-in (sms_opt_in). This resolves the former TODO(consent):
//      profiles.phone_verified_at / sms_opt_in are added by supabase-migrations-FEATURE4.sql
//      and captured through the verified-phone flow in dashboard/profile/security-actions.ts.
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
    const action = p.actionUrl ? `\n\nAnswer now (link expires in 15 minutes): ${p.actionUrl}` : '';
    const text = `${p.body ?? p.title}${action}${url ? `\n\nOpen your dashboard: ${url}` : ''}`;
    await sendHostEmail(contact.email, `Moche-AI: ${p.title}`, text);
  }

  // 3. Host SMS fan-out (escalation + maintenance only, all gates must pass).
  //    Consent-gated per TCPA: the owner must have a VERIFIED phone AND an active
  //    sms_opt_in. This resolves notify()'s historical TODO(consent).
  if (wantsSmsKind && serverEnv.notifySmsEnabled && contact.phone && contact.smsOptIn && contact.phoneVerifiedAt) {
    const ent = await getEntitlements(client, p.hostAccountId);
    if (ent.smsEscalation && resolveTwilioAuth()) {
      // Keep it short; never include guest PII beyond the already-truncated title.
      // Append the answer magic link when present so the host can reply from the SMS.
      const msg = p.actionUrl ? `Moche-AI: ${p.title} Answer: ${p.actionUrl}` : `Moche-AI: ${p.title}`;
      await sendSms(contact.phone, msg);
    }
  }
}

// Sends a host phone-verification / login 2FA OTP over SMS, reusing the same Twilio
// fetch path as every other SMS here (no second client). The full code is NEVER logged.
export async function sendHostOtp(phone: string, code: string): Promise<boolean> {
  return sendSms(phone, `Moche-AI verification code: ${code}\n\nExpires in 10 minutes. Never share this code. Reply STOP to opt out.`);
}

// Best-effort guest ping when a host answers an escalation. Only ever called after an
// affirmative TCPA opt-in (notification_consent) recorded on the guest session. The
// answer text is NOT included — the guest opens their concierge to read it. Failures
// are swallowed; contact/body are never logged (status codes only, via the senders).
export async function notifyGuestReply(p: { contact: string; propertyName: string; portalUrl: string }): Promise<void> {
  try {
    if (p.contact.includes('@')) {
      await sendHostEmail(
        p.contact,
        `Your host replied — ${p.propertyName}`,
        `Good news — your host just replied to your question about ${p.propertyName}.\n\nOpen your concierge to read it: ${p.portalUrl}`,
      );
    } else {
      await sendSms(p.contact, `Moche-AI: Your host replied to your question. Open your concierge: ${p.portalUrl} Reply STOP to opt out.`);
    }
  } catch {
    /* best-effort — never block the answer flow */
  }
}

// Host-initiated guest portal share (Stays tab → Share with guests). Moche-AI
// branded, carrying the host's property name and the stay's one access code.
// Transactional by construction: the host triggered this exact send for this
// specific recipient. Returns false when the provider is unconfigured or the
// send fails — the caller records the outcome in stay_share_invites.
export async function sendGuestPortalShare(p: {
  channel: 'sms' | 'email';
  contact: string;
  propertyName: string;
  portalUrl: string;
  code: string;
}): Promise<boolean> {
  if (p.channel === 'email') {
    return sendHostEmail(
      p.contact,
      `Your host shared Moche-AI with you — ${p.propertyName}`,
      [
        `Good news — your host at ${p.propertyName} is sharing Moche-AI, their AI concierge, with you for your stay.`,
        ``,
        `Open your guest portal: ${p.portalUrl}`,
        `Your stay access code: ${p.code}`,
        ``,
        `Ask the concierge anything about the property, message your host directly, and more.`,
      ].join('\n'),
    );
  }
  return sendSms(
    p.contact,
    `Moche-AI: Your host at ${p.propertyName} is sharing their AI concierge with you. Open ${p.portalUrl} and enter stay code ${p.code}. Reply STOP to opt out.`,
  );
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
      subject: 'Your Moche-AI verification code',
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
      Body: `Your Moche-AI verification code is: ${p.code}\n\nExpires in 10 minutes. Never share this code.`,
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
