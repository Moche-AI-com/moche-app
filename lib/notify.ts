import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';
import { isProductionRuntime, resolveTwilioAuth, serverEnv, publicEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestMessagingReadiness } from '@/lib/guest/messaging-readiness';
import { sendGuestPush } from '@/lib/guest/push';
import { normalizeSmsPhone } from '@/lib/notifications/phone';
import { isSmsSuppressed } from '@/lib/notifications/sms-suppression';
import { guestConversationLink, safeNotificationUrl } from '@/lib/notifications/links';
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
  // Legacy compatibility only. Bearer answer URLs are no longer sent; use link.
  actionUrl?: string;
}

export type SmsStatus = 'accepted' | 'failed' | 'unknown' | 'disabled' | 'not_eligible' | 'not_attempted' | 'partial';
export interface SmsResult { status: SmsStatus }
export interface NotificationResult {
  inApp: 'stored' | 'failed';
  sms: SmsStatus;
  smsAccepted: number;
  emailAccepted: number;
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
async function sendSms(to: string, message: string, client?: Client): Promise<SmsResult> {
  // Next production builds also run for Vercel previews. BOTH runtime signals
  // and the existing NOTIFY_SMS_ENABLED switch are required for every SMS path.
  if (!isProductionRuntime() || !serverEnv.smsDeliveryEnabled) {
    return { status: 'disabled' };
  }
  const phone = normalizeSmsPhone(to);
  if (!phone) return { status: 'not_eligible' };
  const auth = resolveTwilioAuth();
  if (!auth) {
    log.warn('sms_disabled_no_twilio_config', {});
    return { status: 'disabled' };
  }
  const body = new URLSearchParams({ To: phone, From: auth.fromNumber, Body: message });
  try {
    if (await isSmsSuppressed(client ?? createAdminClient(), phone)) return { status: 'not_eligible' };
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth.authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      }
    );
    if (!res.ok) {
      // Status only — response body may contain PII / token hints.
      log.error('sms_send_failed', { status: res.status });
      return { status: 'failed' };
    }
    // HTTP acceptance is not delivery. A malformed success is ambiguous, never
    // retried: the provider may already have enqueued the SMS.
    const accepted = await res.json().catch(() => null);
    if (!accepted?.sid) return { status: 'unknown' };
    if (['failed', 'undelivered', 'canceled'].includes(accepted.status)) return { status: 'failed' };
    return { status: 'accepted' };
  } catch {
    log.error('sms_send_outcome_unknown', {});
    return { status: 'unknown' };
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
      log.error('host_email_failed', {});
      return false;
    }
    return true;
  } catch {
    log.error('host_email_error', {});
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

// Resolve only the account owner and property-assigned recipients. Targeting
// narrows that authorized set; a caller cannot name an unrelated profile.
async function loadRecipientContacts(
  client: Client,
  hostAccountId: string,
  recipientProfileId: string | null,
  propertyId: string | null,
): Promise<RecipientContact[]> {
  const { data: account } = await client
    .from('host_accounts')
    .select('owner_id')
    .eq('id', hostAccountId)
    .maybeSingle();
  if (!account) return [];
  const ownerId = (account as { owner_id: string }).owner_id;
  let memberIds: string[] = [];
  if (propertyId) {
    const { data: property } = await client.from('properties').select('host_account_id').eq('id', propertyId).maybeSingle();
    if (property?.host_account_id !== hostAccountId) return [];
    const { data: members, error } = await client.from('property_members').select('profile_id')
      .eq('property_id', propertyId).eq('can_reply_guests', true);
    if (error) return [];
    memberIds = (members ?? []).map((m) => m.profile_id);
  } else {
    const { data: members, error } = await client.from('organization_members').select('profile_id').eq('host_account_id', hostAccountId);
    if (error) return [];
    memberIds = (members ?? []).map((m) => m.profile_id);
  }
  let ids = Array.from(new Set([ownerId, ...memberIds]));
  if (recipientProfileId) ids = ids.filter((id) => id === recipientProfileId);
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

// Absent row uses registry defaults; failed reads suppress external channels.
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
      return { enabled: false, email_enabled: false, sms_enabled: false };
    }
    return (data as CategoryPref | null) ?? null;
  } catch {
    return { enabled: false, email_enabled: false, sms_enabled: false };
  }
}

// Store the in-app row before external fan-out, returning both outcomes.
// Each SMS requires production + configured transport + the recipient's own
// verified phone, explicit opt-in and no STOP suppression. Direct host_message
// notifications are not a paid escalation feature; other kinds retain plan and
// per-category channel preferences.
export async function notify(client: Client, p: NotifyParams): Promise<NotificationResult> {
  const result: NotificationResult = { inApp: 'failed', sms: 'not_attempted', smsAccepted: 0, emailAccepted: 0 };
  // 1. Durable in-app row (source of truth). Always written, even for members
  //    who muted the category: the bell and history filter at READ time, so the
  //    account keeps a complete record and a muted member can still find it.
  try {
    const { error } = await client.from('notifications').insert({
      host_account_id: p.hostAccountId,
      kind: p.kind,
      title: p.title,
      body: p.body ?? null,
      link: p.link ?? null,
      property_id: p.propertyId ?? null,
      recipient_profile_id: p.recipientProfileId ?? null,
    });
    if (error) {
      log.warn('notify_failed', { kind: p.kind });
      return result;
    }
    result.inApp = 'stored';
  } catch {
    log.warn('notify_failed', { kind: p.kind });
    return result;
  }

  try {
  const wantsEmail = EMAIL_FANOUT_KINDS.has(p.kind);
  const wantsSmsKind = SMS_FANOUT_KINDS.has(p.kind);
  if (!wantsEmail && !wantsSmsKind) return result;

  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === CATEGORY_FOR_KIND[p.kind]);

  // 2. Resolve authorized recipients; do not fan out to unassigned org members.
  const recipients = await loadRecipientContacts(client, p.hostAccountId, p.recipientProfileId ?? null, p.propertyId ?? null);
  if (recipients.length === 0) return { ...result, sms: 'not_eligible' };

  // Entitlements are account-level; resolve once, and only when an SMS could fly.
  // The direct guest/host line is not an escalation plan feature. Other SMS
  // categories retain their paid entitlement; all retain global consent gates.
  const ent = wantsSmsKind && serverEnv.notifySmsEnabled && p.kind !== 'host_message' ? await getEntitlements(client, p.hostAccountId) : null;
  const statuses: SmsStatus[] = [];
  const url = safeNotificationUrl(publicEnv.appUrl, p.link);

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
      const text = `${p.body ?? p.title}${url ? `\n\nOpen your dashboard: ${url}` : ''}`;
      if (await sendHostEmail(recipient.email, `Moche-AI: ${p.title}`, text)) result.emailAccepted++;
    }

    // 5. Text to this eligible member, never using another profile's consent.
    if (
      wantsSmsKind &&
      serverEnv.notifySmsEnabled &&
      (p.kind === 'host_message' || ent?.smsEscalation) &&
      recipient.phone &&
      recipient.smsOptIn &&
      recipient.phoneVerifiedAt &&
      (category?.alwaysOn || pref?.sms_enabled === true)
    ) {
      // No guest names, message bodies, access codes or bearer answer links.
      const msg = `Moche-AI: You have a new ${p.kind === 'host_message' ? 'guest message' : 'notification'}.${url ? ` Open: ${url}` : ''} Reply STOP to opt out.`;
      const sent = await sendSms(recipient.phone, msg, client);
      statuses.push(sent.status);
      if (sent.status === 'accepted') result.smsAccepted++;
    }
  }
  result.sms = statuses.length === 0 ? 'not_eligible'
    : statuses.every((s) => s === 'accepted') ? 'accepted'
    : statuses.includes('accepted') ? 'partial'
    : statuses.includes('unknown') ? 'unknown'
    : statuses.includes('failed') ? 'failed'
    : statuses[0];
  return result;
  } catch {
    log.warn('notify_fanout_failed', { kind: p.kind });
    return { ...result, sms: 'unknown' };
  }
}

// Sends a host phone-verification / login 2FA OTP over SMS, reusing the same Twilio
// fetch path as every other SMS here (no second client). The full code is NEVER logged.
export async function sendHostOtp(phone: string, code: string): Promise<boolean> {
  return (await sendSms(phone, `Moche-AI verification code: ${code}\n\nExpires in 10 minutes. Never share this code. Reply STOP to opt out.`)).status === 'accepted';
}

// Low-level transport; direct-message callers must use the scoped helper below.
// Answer text is excluded. Failure/ambiguity is returned, never silently successful.
export async function notifyGuestReply(p: { contact: string; propertyName: string; portalUrl: string }, client?: Client): Promise<SmsResult> {
  const url = safeNotificationUrl(publicEnv.appUrl, p.portalUrl);
  if (!url) return { status: 'not_eligible' };
  return sendSms(p.contact, `Moche-AI: Your host replied. Open your conversation: ${url} Reply STOP to opt out.`, client);
}

/** Resolve the destination from the EXACT conversation participant, never from
 * the most recently opted-in person on the stay. URLs carry no access tokens.
 *
 * Channel order (issue #133, item 5): web-push FIRST — the browser subscription
 * the guest created on this device, no phone number or SMS consent needed.
 * SMS below remains for guests who explicitly opted in with a verified phone. */
export async function notifyGuestConversationReply(client: Client, p: {
  propertyId: string; stayId: string; conversationId: string; messageId: string; slug: string;
}): Promise<SmsResult> {
  try {
    const { data: conversation, error } = await client.from('conversations')
      .select('guest_session_id, guest_identity_id').eq('id', p.conversationId)
      .eq('property_id', p.propertyId).eq('stay_id', p.stayId).eq('channel', 'host_chat').maybeSingle();
    if (error || !conversation?.guest_session_id) return { status: 'not_eligible' };
    const { data: message, error: messageError } = await client.from('messages')
      .select('id').eq('id', p.messageId).eq('conversation_id', p.conversationId)
      .eq('property_id', p.propertyId).eq('role', 'host').maybeSingle();
    if (messageError || !message) return { status: 'not_eligible' };

    const pushed = await sendGuestPush(client, {
      sessionId: conversation.guest_session_id,
      propertyId: p.propertyId,
      stayId: p.stayId,
      title: 'Moche-AI',
      body: 'Your host replied.',
      url: safeNotificationUrl(publicEnv.appUrl, guestConversationLink(p.slug, p.conversationId, p.messageId)) ?? '',
    });
    if (pushed === 'sent') return { status: 'accepted' };

    const readiness = await getGuestMessagingReadiness(client, {
      propertyId: p.propertyId, stayId: p.stayId, sessionId: conversation.guest_session_id,
    });
    if (!readiness.ready) return { status: 'not_eligible' };
    return notifyGuestReply({
      contact: readiness.contact, propertyName: '',
      portalUrl: guestConversationLink(p.slug, p.conversationId, p.messageId),
    }, client);
  } catch { return { status: 'unknown' }; }
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
  return (await sendSms(
    p.contact,
    `Moche-AI: Your host at ${p.propertyName} is sharing their AI concierge with you. Open ${p.portalUrl} and enter stay code ${p.code}. Reply STOP to opt out.`,
  )).status === 'accepted';
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
  return (await sendSms(p.contact, p.text)).status === 'accepted';
}

// Delivers a guest OTP out-of-band (email/SMS).
// Security contract:
//   - The OTP code is NEVER logged, including in development.
//   - Twilio credentials are read exclusively from serverEnv (process.env) via
//     resolveTwilioAuth — never from client-accessible paths, params, bodies, or headers.
//   - Uses the Twilio Messages REST API directly via native fetch to minimise attack surface.
export async function notifyGuestOtp(p: { contact: string; code: string; devFallback: boolean }): Promise<void> {
  if (p.devFallback) {
    // Never log a usable OTP, including development. Test transport is mocked.
    throw new Error('Verification delivery is disabled in preview.');
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
      log.error('guest_otp_email_failed', {});
      throw new Error('Email delivery failed');
    }
    log.info('guest_otp_email_sent', { channel: 'email' });
  } else {
    const result = await sendSms(p.contact, `Moche-AI verification code: ${p.code}\n\nExpires in 10 minutes. Never share this code.`);
    if (result.status !== 'accepted') throw new Error('SMS verification could not be confirmed.');
    log.info('guest_otp_sms_accepted', { channel: 'sms' });
  }
}
