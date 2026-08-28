import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';
import { resolveTwilioAuth, serverEnv, publicEnv } from '@/lib/env';
import { getEntitlements } from '@/lib/billing/entitlements';
import { TRANSACTIONAL_SENDER } from '@/lib/mail/senders';
import {
  CATEGORY_FOR_KIND,
  EMAIL_FANOUT_KINDS,
  NOTIFICATION_CATEGORIES,
  SMS_FANOUT_KINDS,
} from '@/lib/notifications/categories';

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

// Which kinds may fan out to email / SMS at all lives in the category registry
// (EMAIL_FANOUT_KINDS / SMS_FANOUT_KINDS) so the settings UI and this sender can
// never disagree about whether a channel exists for a path.
// History: 'system' was added for WS-1 visit-code lockout alerts; 'extras' for
// guest enhancement requests; 'host_message' came with the Host Chat kind split.

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

// Sends a plain-text host email via Resend (server-side only). replyTo defaults
// to the monitored transactional identity; host-initiated shares (service
// reports) pass the assigned contact's address so recipient replies reach the
// host's team instead of our support inbox. Accepts a To list and optional CC
// so the report compose view can address one email to several recipients.
async function sendHostEmail(
  to: string | string[],
  subject: string,
  text: string,
  replyTo: string = EMAIL_REPLY_TO,
  cc?: string[],
): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.warn('email_disabled_no_resend_key', {});
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo,
      to,
      ...(cc && cc.length > 0 ? { cc } : {}),
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

interface RecipientContact {
  profileId: string;
  email: string | null;
  phone: string | null;
  smsOptIn: boolean;
  phoneVerifiedAt: string | null;
}

type ProfileRow = { id: string; email: string | null; phone: string | null; sms_opt_in: boolean; phone_verified_at: string | null };

function mapRecipient(row: ProfileRow): RecipientContact {
  return {
    profileId: row.id,
    email: row.email,
    phone: row.phone,
    smsOptIn: !!row.sms_opt_in,
    phoneVerifiedAt: row.phone_verified_at,
  };
}

// Resolves everyone a notification can reach: a targeted notification
// (recipientProfileId) goes to that one member; an account-wide one goes to the
// owner plus every org member. Runs under the service client from server
// routes, so membership scoping comes from the callers, not RLS.
async function loadRecipientContacts(
  client: Client,
  hostAccountId: string,
  recipientProfileId: string | null,
): Promise<RecipientContact[]> {
  if (recipientProfileId) {
    const { data: profile } = await client
      .from('profiles')
      .select('id, email, phone, sms_opt_in, phone_verified_at')
      .eq('id', recipientProfileId)
      .maybeSingle();
    return profile ? [mapRecipient(profile as unknown as ProfileRow)] : [];
  }
  const { data: account } = await client
    .from('host_accounts')
    .select('owner_id')
    .eq('id', hostAccountId)
    .maybeSingle();
  if (!account) return [];
  const ownerId = (account as { owner_id: string }).owner_id;
  const { data: members } = await client
    .from('organization_members')
    .select('profile_id')
    .eq('host_account_id', hostAccountId);
  const ids = Array.from(new Set([ownerId, ...((members ?? []) as Array<{ profile_id: string }>).map((m) => m.profile_id)]));
  if (ids.length === 0) return [];
  const { data: profiles } = await client
    .from('profiles')
    .select('id, email, phone, sms_opt_in, phone_verified_at')
    .in('id', ids);
  return ((profiles ?? []) as unknown as ProfileRow[]).map(mapRecipient);
}

interface CategoryPref {
  enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
}

// Loads one member's preference row for one category. No row (or any read
// failure) returns null = subscribed with default channels: a lookup problem
// must never silently swallow a notification.
async function loadCategoryPref(client: Client, profileId: string, categoryKey: string, kind: string): Promise<CategoryPref | null> {
  try {
    const { data, error } = await client
      .from('notification_preferences')
      .select('enabled, email_enabled, sms_enabled')
      .eq('profile_id', profileId)
      .eq('category', categoryKey)
      .maybeSingle();
    if (error) {
      log.warn('notify_pref_read_failed', { kind });
      return null;
    }
    return (data as CategoryPref | null) ?? null;
  } catch {
    return null;
  }
}

// Creates the durable in-app notification row and fans out to email (now) and host SMS
// (Pro+, behind a feature flag) on a best-effort basis. Fan-out failures NEVER throw —
// the in-app row is the source of truth and the host dashboard always reflects it.
//
// Fan-out is PER MEMBER: a targeted notification (recipientProfileId) reaches only
// that member; an account-wide one reaches the owner + every org member. Each
// member's Profile → Notifications preferences gate their own email/text delivery.
//
// Host SMS gating requires ALL of:
//   1. NOTIFY_SMS_ENABLED feature flag on, AND
//   2. plan entitlement smsEscalation (Pro+), AND
//   3. valid Twilio config present, AND
//   4. the member has a VERIFIED phone (phone_verified_at) AND an active TCPA
//      opt-in (sms_opt_in) — captured in dashboard/profile/security-actions.ts — AND
//   5. the member's per-category text switch is on (sms_enabled, default off).
export async function notify(client: Client, p: NotifyParams): Promise<void> {
  // 1. Durable in-app row (source of truth). Always written, even for members
  //    who muted the category: the bell and history filter at READ time, so the
  //    account keeps a complete record and a muted member can still find it.
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

  const wantsEmail = EMAIL_FANOUT_KINDS.has(p.kind);
  const wantsSmsKind = SMS_FANOUT_KINDS.has(p.kind);
  if (!wantsEmail && !wantsSmsKind) return;

  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === CATEGORY_FOR_KIND[p.kind]);

  // 2. Resolve recipients (targeted member, or owner + all org members).
  const recipients = await loadRecipientContacts(client, p.hostAccountId, p.recipientProfileId ?? null);
  if (recipients.length === 0) return;

  // Entitlements are account-level; resolve once, and only when an SMS could fly.
  const ent = wantsSmsKind && serverEnv.notifySmsEnabled ? await getEntitlements(client, p.hostAccountId) : null;

  for (const recipient of recipients) {
    // 3. Preference gate. Always-on paths skip it entirely. A member whose
    //    master switch is off for the category gets nothing on any channel;
    //    email/text then honour their per-channel switches (defaults: email on,
    //    text off).
    let pref: CategoryPref | null = null;
    if (category && !category.alwaysOn) {
      pref = await loadCategoryPref(client, recipient.profileId, category.key, p.kind);
      if (pref && !pref.enabled) {
        log.info('notify_fanout_muted', { kind: p.kind });
        continue;
      }
    }

    // 4. Email to this member.
    if (wantsEmail && recipient.email && (category?.alwaysOn || !pref || pref.email_enabled)) {
      const url = p.link ? `${publicEnv.appUrl}${p.link}` : '';
      const action = p.actionUrl ? `\n\nAnswer now (link expires in 15 minutes): ${p.actionUrl}` : '';
      const text = `${p.body ?? p.title}${action}${url ? `\n\nOpen your dashboard: ${url}` : ''}`;
      await sendHostEmail(recipient.email, `Moche-AI: ${p.title}`, text);
    }

    // 5. Text to this member (escalation + maintenance kinds only, every gate
    //    above plus their own per-category text switch — TCPA double opt-in).
    if (
      wantsSmsKind &&
      ent?.smsEscalation &&
      resolveTwilioAuth() &&
      recipient.phone &&
      recipient.smsOptIn &&
      recipient.phoneVerifiedAt &&
      (category?.alwaysOn || !pref || pref.sms_enabled)
    ) {
      // Keep it short; never include guest PII beyond the already-truncated title.
      // Append the answer magic link when present so the host can reply from the SMS.
      const msg = p.actionUrl ? `Moche-AI: ${p.title} Answer: ${p.actionUrl}` : `Moche-AI: ${p.title}`;
      await sendSms(recipient.phone, msg);
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

// Host-initiated service report share (Service tab → Email/Text report, and the
// printable report page). Sends the share-safe report text built by
// lib/service-requests/share-report.ts to recipients the host chose on the
// compose screen. Transactional by construction: the host triggered this exact
// send for these specific recipients. replyTo is the ticket's assigned contact
// when it has an email, so a recipient's reply reaches the host's chosen
// contact rather than our support inbox. Returns false when the provider is
// unconfigured or the send fails — the caller records the outcome in
// service_report_shares.
export async function sendServiceReportShare(p: {
  channel: 'sms' | 'email';
  /** SMS: the destination number. Email: fallback recipient when `to` is omitted. */
  contact: string;
  /** Email only: full To list (the compose view collects one chip per address). */
  to?: string[];
  /** Email only: CC recipients. */
  cc?: string[];
  replyToEmail?: string | null;
  /** Email only; ignored for SMS. */
  subject?: string;
  text: string;
}): Promise<boolean> {
  if (p.channel === 'email') {
    const to = p.to && p.to.length > 0 ? p.to : [p.contact];
    return sendHostEmail(to, p.subject ?? 'Service report', p.text, p.replyToEmail ?? undefined, p.cc);
  }
  return sendSms(p.contact, p.text);
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
      Body: `Moche-AI verification code: ${p.code}\n\nExpires in 10 minutes. Never share this code.`,
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
      },
    );

    if (!res.ok) {
      // Log HTTP status only — never log the response body (may contain PII or token hints).
      log.error('guest_otp_sms_failed', { status: res.status, channel: 'sms' });
      throw new Error(`SMS delivery failed (HTTP ${res.status})`);
    }

    log.info('guest_otp_sms_sent', { channel: 'sms', mode: auth.mode });
  }
}
