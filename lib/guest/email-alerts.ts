import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';
import { publicEnv, serverEnv } from '@/lib/env';
import { hashContact, safeEqualHex } from '@/lib/crypto';
import { TRANSACTIONAL_SENDER } from '@/lib/mail/senders';
import { log } from '@/lib/log';
import { GUEST_EMAIL_CONFIRM_TTL_MS, normalizeGuestEmail } from '@/lib/guest/email-alerts-core';

// Guest email alerts (#195, PR 2b). A guest opts in with an address + explicit
// consent, confirms it with a one-tap link (token stored hashed only, 30-minute
// TTL, single use), and is then emailed a content-free "your host replied"
// notice when push and SMS are unavailable. Addresses are never logged.

type Client = SupabaseClient<Database>;
type Scope = { sessionId: string; propertyId: string; stayId: string };

function hashToken(token: string): string {
  return createHash('sha256').update(`guest-email-confirm:${token}`).digest('hex');
}
function unsubSig(sessionId: string): string {
  return createHmac('sha256', `${serverEnv.guestContactSalt}:guest-email-unsub`).update(sessionId).digest('hex');
}
export function signGuestEmailUnsubscribe(sessionId: string): string {
  return `${sessionId}.${unsubSig(sessionId)}`;
}
export function verifyGuestEmailUnsubscribe(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const sessionId = token.slice(0, dot);
  return safeEqualHex(token.slice(dot + 1), unsubSig(sessionId)) ? sessionId : null;
}
function appBase(): string {
  return publicEnv.appUrl.replace(/\/$/, '');
}

async function sendEmail(to: string, subject: string, text: string, unsubscribeUrl?: string): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.warn('guest_email_disabled_no_resend_key', {});
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({
      from: TRANSACTIONAL_SENDER.from,
      replyTo: TRANSACTIONAL_SENDER.replyTo,
      to,
      subject,
      text,
      ...(unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    });
    if (error) {
      log.error('guest_email_send_failed', {});
      return false;
    }
    return true;
  } catch {
    log.error('guest_email_send_error', {});
    return false;
  }
}

/** Saves the address + consent on THIS session only, then emails a one-tap confirm link. */
export async function startGuestEmailAlerts(admin: Client, scope: Scope, rawEmail: string, propertyName: string): Promise<'sent' | 'invalid_email' | 'failed'> {
  const email = normalizeGuestEmail(rawEmail);
  if (!email) return 'invalid_email';
  const db = admin as any;
  const now = new Date().toISOString();
  try {
    const { error: saveError } = await db.from('guest_access_sessions').update({
      notify_email: email, notify_email_consent_at: now, notify_email_verified_at: null, notify_email_opted_out_at: null,
    }).eq('id', scope.sessionId).eq('property_id', scope.propertyId).eq('stay_id', scope.stayId).is('revoked_at', null);
    if (saveError) return 'failed';
    await db.from('guest_email_confirmations').update({ consumed_at: now })
      .eq('session_id', scope.sessionId).is('consumed_at', null);
    const token = randomBytes(32).toString('base64url');
    const { error } = await db.from('guest_email_confirmations').insert({
      session_id: scope.sessionId, property_id: scope.propertyId,
      email_hash: hashContact(email).contactHash, token_hash: hashToken(token),
      expires_at: new Date(Date.now() + GUEST_EMAIL_CONFIRM_TTL_MS).toISOString(),
    });
    if (error) return 'failed';
    const link = `${appBase()}/api/guest/email/confirm?token=${encodeURIComponent(token)}`;
    const ok = await sendEmail(email, `Confirm email alerts for your stay${propertyName ? ` at ${propertyName}` : ''}`, [
      `Tap to confirm Moche-AI can email you when your host replies during your stay${propertyName ? ` at ${propertyName}` : ''}:`,
      '',
      link,
      '',
      'This link expires in 30 minutes and works once. If you did not ask for this, ignore this email and nothing will be sent.',
    ].join('\n'));
    return ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Consumes a confirm token exactly once. Returns the portal slug on success. */
export async function confirmGuestEmail(admin: Client, token: string): Promise<{ ok: true; slug: string | null } | { ok: false }> {
  if (!token || token.length > 200) return { ok: false };
  const db = admin as any;
  const now = new Date().toISOString();
  try {
    const { data: claimed, error } = await db.from('guest_email_confirmations')
      .update({ consumed_at: now })
      .eq('token_hash', hashToken(token)).is('consumed_at', null).gt('expires_at', now)
      .select('session_id, property_id, email_hash').maybeSingle();
    if (error || !claimed) return { ok: false };
    const { data: session } = await db.from('guest_access_sessions')
      .select('id, notify_email, revoked_at').eq('id', claimed.session_id).eq('property_id', claimed.property_id).maybeSingle();
    // The address must still be the one this link was minted for.
    if (!session || session.revoked_at || typeof session.notify_email !== 'string' ||
        hashContact(session.notify_email).contactHash !== claimed.email_hash) return { ok: false };
    const { error: saveError } = await db.from('guest_access_sessions')
      .update({ notify_email_verified_at: now, notify_email_opted_out_at: null })
      .eq('id', claimed.session_id).eq('notify_email', session.notify_email);
    if (saveError) return { ok: false };
    const { data: property } = await db.from('properties').select('slug').eq('id', claimed.property_id).maybeSingle();
    return { ok: true, slug: (property?.slug as string | undefined) ?? null };
  } catch {
    return { ok: false };
  }
}

export async function unsubscribeGuestEmail(admin: Client, token: string): Promise<boolean> {
  const sessionId = verifyGuestEmailUnsubscribe(token);
  if (!sessionId) return false;
  try {
    const { error } = await (admin as any).from('guest_access_sessions')
      .update({ notify_email_opted_out_at: new Date().toISOString() }).eq('id', sessionId);
    return !error;
  } catch {
    return false;
  }
}

/** Confirmed, consented, not opted out, session + stay still live. Same liveness rules as SMS. */
export async function getGuestEmailReadiness(admin: Client, scope: Scope): Promise<{ ready: true; email: string } | { ready: false }> {
  try {
    const { data: row, error } = await admin.from('guest_access_sessions')
      .select('*').eq('id', scope.sessionId).eq('stay_id', scope.stayId).eq('property_id', scope.propertyId).maybeSingle();
    const s = row as Record<string, unknown> | null;
    if (error || !s || s.status !== 'verified' || s.revoked_at || !(Date.parse(String(s.expires_at)) > Date.now())) return { ready: false };
    const { data: stay, error: stayError } = await admin.from('stays')
      .select('status, deleted_at, check_out').eq('id', scope.stayId).eq('property_id', scope.propertyId).maybeSingle();
    if (stayError || !stay || stay.deleted_at || stay.status === 'revoked' ||
        !(Date.parse(stay.check_out) + DEFAULT_GRACE_PERIOD_HOURS * 3600000 > Date.now())) return { ready: false };
    const email = normalizeGuestEmail(s.notify_email);
    if (!email || !s.notify_email_consent_at || !s.notify_email_verified_at || s.notify_email_opted_out_at) return { ready: false };
    return { ready: true, email };
  } catch {
    return { ready: false };
  }
}

/** Content-free "your host replied" email with a one-click unsubscribe. */
export async function sendGuestReplyEmail(admin: Client, scope: Scope, conversationUrl: string): Promise<boolean> {
  const readiness = await getGuestEmailReadiness(admin, scope);
  if (!readiness.ready) return false;
  const unsubscribeUrl = `${appBase()}/api/guest/email/unsubscribe?token=${encodeURIComponent(signGuestEmailUnsubscribe(scope.sessionId))}`;
  return sendEmail(readiness.email, 'Your host replied', [
    'Your host replied to your message. Open your conversation to read it:',
    '',
    conversationUrl,
    '',
    `Stop these emails: ${unsubscribeUrl}`,
  ].join('\n'), unsubscribeUrl);
}
