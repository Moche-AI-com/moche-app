import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';
import { isProductionRuntime, resolveTwilioAuth, serverEnv, publicEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestMessagingReadiness } from '@/lib/guest/messaging-readiness';
import { sendGuestPush } from '@/lib/guest/push';
import { sendGuestReplyEmail } from '@/lib/guest/email-alerts';
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
import { checkSmsCaps, recordDelivery } from '@/lib/notifications/deliveries';
import {
  appRouteUrl,
  conversationIdFromLink,
  type DeliveryStatus,
  type Urgency,
} from '@/lib/notifications/delivery-status';

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
  // #195: urgency tier (p1 bypasses SMS caps) and owning conversation. When
  // conversationId is omitted it is read from a conversation deep link.
  urgency?: Urgency | null;
  conversationId?: string | null;
  // Legacy compatibility only. Bearer answer URLs are no longer sent; use link.
  actionUrl?: string;
}

export type SmsStatus = 'accepted' | 'failed' | 'unknown' | 'disabled' | 'not_eligible' | 'not_attempted' | 'partial';
// sid is the provider message id (not PII); used to match Twilio status callbacks.
export interface SmsResult { status: SmsStatus; sid?: string }
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
async function sendSms(
  to: string,
  message: string,
  client?: Client,
  opts?: { statusCallbackUrl?: string | null },
): Promise<SmsResult> {
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
  // #195: delivery receipts post back to /api/webhooks/twilio/status.
  if (opts?.statusCallbackUrl) body.set('StatusCallback', opts.statusCallbackUrl);
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
    return { status: 'accepted', sid: String(accepted.sid) };
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

// #195: map a transport outcome to a delivery row. 'accepted' and 'unknown'
// stay queued until Twilio's status callback advances them; both count toward
// SMS caps so an ambiguous send is never followed by a duplicate.
function smsDeliveryOutcome(status: SmsStatus): { status: DeliveryStatus; reason: string | null } {
  switch (status) {
    case 'accepted': return { status: 'queued', reason: null };
    case 'unknown': return { status: 'queued', reason: 'outcome_unknown' };
    case 'failed': return { status: 'failed', reason: 'provider_failed' };
    case 'disabled': return { status: 'skipped', reason: 'sms_disabled' };
    default: return { status: 'skipped', reason: 'not_eligible' };
  }
}

// Delivery bookkeeping must never block or fail a real alert.
async function track(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    log.warn('notify_tracking_failed', {});
  }
}

// Store the in-app row before external fan-out, returning both outcomes.
// Each SMS requires production + configured transport + the recipient's own
// verified phone, explicit opt-in and no STOP suppression. Direct host_message
// and escalation texts are core reliability, not a paid plan feature (a guest
// is waiting on a person either way); other kinds retain plan gating. Every
// non-always-on kind keeps its per-category channel preferences.
// #195: every attempt is recorded in notification_deliveries, SMS respects the
// per-conversation window and hourly cap (P1 exempt), and host links go through
// the tracked /api/notifications/[id]/open route so opening counts as seen.
export async function notify(client: Client, p: NotifyParams): Promise<NotificationResult> {
  const result: NotificationResult = { inApp: 'failed', sms: 'not_attempted', smsAccepted: 0, emailAccepted: 0 };
  const notificationId = randomUUID();
  const conversationId = p.conversationId ?? conversationIdFromLink(p.link);
  // 1. Durable in-app row (source of truth). Always written, even for members
  //    who muted the category: the bell and history filter at READ time, so the
  //    account keeps a complete record and a muted member can still find it.
  try {
    const { error } = await client.from('notifications').insert({
      id: notificationId,
      host_account_id: p.hostAccountId,
      kind: p.kind,
      title: p.title,
      body: p.body ?? null,
      link: p.link ?? null,
      property_id: p.propertyId ?? null,
      recipient_profile_id: p.recipientProfileId ?? null,
      // #195 columns (not yet in database.types).
      urgency: p.urgency ?? null,
      conversation_id: conversationId,
    } as never);
    if (error) {
      log.warn('notify_failed', { kind: p.kind });
      return result;
    }
    result.inApp = 'stored';
  } catch {
    log.warn('notify_failed', { kind: p.kind });
    return result;
  }
  await track(() => recordDelivery(client, {
    notificationId, recipientProfileId: p.recipientProfileId ?? null, channel: 'in_app', status: 'delivered',
  }));

  try {
  const wantsEmail = EMAIL_FANOUT_KINDS.has(p.kind);
  const wantsSmsKind = SMS_FANOUT_KINDS.has(p.kind);
  if (!wantsEmail && !wantsSmsKind) return result;

  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === CATEGORY_FOR_KIND[p.kind]);

  // 2. Resolve authorized recipients; do not fan out to unassigned org members.
  const recipients = await loadRecipientContacts(client, p.hostAccountId, p.recipientProfileId ?? null, p.propertyId ?? null);
  if (recipients.length === 0) return { ...result, sms: 'not_eligible' };

  // Entitlements are account-level; resolve once, and only when an SMS could fly.
  // Direct guest/host messages and escalations are not plan features. Other SMS
  // categories retain their paid entitlement; all retain global consent gates.
  const ent = wantsSmsKind && serverEnv.notifySmsEnabled && p.kind !== 'host_message' && p.kind !== 'escalation' ? await getEntitlements(client, p.hostAccountId) : null;
  const statuses: SmsStatus[] = [];
  const url = safeNotificationUrl(publicEnv.appUrl, p.link);
  // Tracked open link (same destination after sign-in); falls back to the direct link.
  const openUrl = url ? (appRouteUrl(publicEnv.appUrl, `/api/notifications/${notificationId}/open`) ?? url) : null;
  const statusCallbackUrl = appRouteUrl(publicEnv.appUrl, '/api/webhooks/twilio/status');

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
      const text = `${p.body ?? p.title}${openUrl ? `\n\nOpen your dashboard: ${openUrl}` : ''}`;
      const emailed = await sendHostEmail(recipient.email, `Moche-AI: ${p.title}`, text);
      if (emailed) result.emailAccepted++;
      await track(() => recordDelivery(client, {
        notificationId, recipientProfileId: recipient.profileId, channel: 'email',
        status: emailed ? 'sent' : 'failed', reason: emailed ? null : 'email_failed',
      }));
    }

    // 5. Text to this eligible member, never using another profile's consent.
    if (
      wantsSmsKind &&
      serverEnv.notifySmsEnabled &&
      (p.kind === 'host_message' || p.kind === 'escalation' || ent?.smsEscalation) &&
      recipient.phone &&
      recipient.smsOptIn &&
      recipient.phoneVerifiedAt &&
      (category?.alwaysOn || pref?.sms_enabled === true)
    ) {
      // #195 caps: 1 text per conversation per 10 min, 10 per host per hour, P1 exempt.
      const cap = await checkSmsCaps(client, {
        recipientProfileId: recipient.profileId, conversationId, urgency: p.urgency ?? null,
      });
      if (!cap.allowed) {
        const capReason = cap.reason;
        await track(() => recordDelivery(client, {
          notificationId, recipientProfileId: recipient.profileId, channel: 'sms', status: 'suppressed', reason: capReason,
        }));
        // Within the conversation window this host was already texted about this
        // conversation, so the guest-facing outcome is still "host was alerted".
        statuses.push(capReason === 'sms_conversation_window' ? 'accepted' : 'not_eligible');
        continue;
      }
      // No guest names, message bodies, access codes or bearer answer links.
      const what = p.kind === 'host_message' ? 'You have a new guest message.'
        : p.kind === 'escalation' ? 'A guest question needs your answer.'
        : 'You have a new notification.';
      const msg = `Moche-AI: ${what}${openUrl ? ` Open: ${openUrl}` : ''} Reply STOP to opt out.`;
      const sent = await sendSms(recipient.phone, msg, client, { statusCallbackUrl });
      statuses.push(sent.status);
      if (sent.status === 'accepted') result.smsAccepted++;
      const outcome = smsDeliveryOutcome(sent.status);
      await track(() => recordDelivery(client, {
        notificationId, recipientProfileId: recipient.profileId, channel: 'sms',
        status: outcome.status, reason: outcome.reason, providerRef: sent.sid ?? null,
      }));
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

// #195 PR 4: reminder / backup text for an alert nobody has seen yet. Same
// consent, STOP, preference, entitlement and cap gates as notify(). Called only
// by lib/notifications/escalation-runner.ts after it has claimed the step, so a
// step is never sent twice. No guest names, message bodies or codes.
export type ReminderStep = 'sms_15m' | 'backup_30m' | 'p1_repeat_5m' | 'p1_backup_10m';
export interface ReminderNotification {
  id: string;
  host_account_id: string;
  kind: NotificationKind;
  link: string | null;
  property_id: string | null;
  recipient_profile_id: string | null;
  conversation_id: string | null;
  urgency: Urgency | null;
}

export async function sendNotificationReminder(
  client: Client,
  n: ReminderNotification,
  step: ReminderStep,
): Promise<{ sent: number; reason: string | null }> {
  if (!serverEnv.notifySmsEnabled || !SMS_FANOUT_KINDS.has(n.kind)) return { sent: 0, reason: 'sms_not_applicable' };
  const backup = step === 'backup_30m' || step === 'p1_backup_10m';
  // Account-wide alerts already reached every eligible member, so there is
  // nobody further to escalate to.
  if (backup && !n.recipient_profile_id) return { sent: 0, reason: 'no_backup_for_account_wide' };
  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === CATEGORY_FOR_KIND[n.kind]);
  if (!category) return { sent: 0, reason: 'no_category' };
  if (n.kind !== 'host_message' && n.kind !== 'escalation') {
    const ent = await getEntitlements(client, n.host_account_id);
    if (!ent?.smsEscalation) return { sent: 0, reason: 'not_entitled' };
  }
  const all = await loadRecipientContacts(client, n.host_account_id, backup ? null : n.recipient_profile_id, n.property_id);
  const recipients = backup ? all.filter((r) => r.profileId !== n.recipient_profile_id) : all;
  if (recipients.length === 0) return { sent: 0, reason: 'no_recipients' };

  const direct = safeNotificationUrl(publicEnv.appUrl, n.link ?? undefined);
  // The original recipient gets the tracked link (opening = seen). Backup members
  // get the direct link: the tracked route only acknowledges for the alert's own
  // recipient, and opening the conversation acknowledges it via host_read_at.
  const tracked = direct ? (appRouteUrl(publicEnv.appUrl, `/api/notifications/${n.id}/open`) ?? direct) : null;
  const link = backup ? direct : tracked;
  const statusCallbackUrl = appRouteUrl(publicEnv.appUrl, '/api/webhooks/twilio/status');
  const what = n.urgency === 'p1' ? 'URGENT: a guest reported an urgent issue and is still waiting.'
    : n.kind === 'escalation' ? 'A guest question still needs an answer.'
    : 'A guest message is still waiting for a reply.';
  const msg = `Moche-AI ${backup ? '(backup)' : 'reminder'}: ${what}${link ? ` Open: ${link}` : ''} Reply STOP to opt out.`;
  const attempt = backup ? 3 : 2;

  let sent = 0;
  for (const recipient of recipients) {
    const phone = recipient.phone;
    if (!phone || !recipient.smsOptIn || !recipient.phoneVerifiedAt) continue;
    if (!category.alwaysOn) {
      const pref = await loadCategoryPref(client, recipient.profileId, category.key, n.kind);
      if (!pref || !pref.enabled || !pref.sms_enabled) continue;
    }
    const cap = await checkSmsCaps(client, {
      recipientProfileId: recipient.profileId, conversationId: n.conversation_id, urgency: n.urgency,
    });
    if (!cap.allowed) {
      const capReason = cap.reason;
      await track(() => recordDelivery(client, {
        notificationId: n.id, recipientProfileId: recipient.profileId, channel: 'sms', status: 'suppressed', reason: capReason, attempt,
      }));
      continue;
    }
    const result = await sendSms(phone, msg, client, { statusCallbackUrl });
    if (result.status === 'accepted') sent++;
    const outcome = smsDeliveryOutcome(result.status);
    await track(() => recordDelivery(client, {
      notificationId: n.id, recipientProfileId: recipient.profileId, channel: 'sms',
      status: outcome.status, reason: outcome.reason, providerRef: result.sid ?? null, attempt,
    }));
  }
  return { sent, reason: null };
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
 * Channel order (issue #133 item 5, #195): web-push FIRST (the browser
 * subscription the guest created on this device), then SMS for guests who
 * explicitly opted in with a verified phone, then a confirmed + consented email
 * address. An ambiguous SMS outcome ('unknown') may already have been
 * delivered, so it is not followed by an email. */
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

    const conversationPath = guestConversationLink(p.slug, p.conversationId, p.messageId);
    const conversationUrl = safeNotificationUrl(publicEnv.appUrl, conversationPath);
    const pushed = await sendGuestPush(client, {
      sessionId: conversation.guest_session_id,
      propertyId: p.propertyId,
      stayId: p.stayId,
      title: 'Moche-AI',
      body: 'Your host replied.',
      url: conversationUrl ?? '',
    });
    if (pushed === 'sent') return { status: 'accepted' };

    const scope = { propertyId: p.propertyId, stayId: p.stayId, sessionId: conversation.guest_session_id };
    const readiness = await getGuestMessagingReadiness(client, scope);
    let sms: SmsResult = { status: 'not_eligible' };
    if (readiness.ready) {
      sms = await notifyGuestReply({ contact: readiness.contact, propertyName: '', portalUrl: conversationPath }, client);
      if (sms.status === 'accepted' || sms.status === 'unknown') return sms;
    }
    if (conversationUrl && await sendGuestReplyEmail(client, scope, conversationUrl)) return { status: 'accepted' };
    return sms;
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
