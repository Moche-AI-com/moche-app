import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { serverEnv, publicEnv } from '@/lib/env';
import { log } from '@/lib/log';

// ---------------------------------------------------------------------------
// Auth email delivery via Resend.
//
// Supabase's built-in SMTP sender was failing (535 "Authentication credentials
// invalid"), which rolled back every signup and surfaced as an empty "{}" error
// on the signup form. To remove that fragile second copy of our email config, we
// let Supabase *generate* the secure verification link (admin.generateLink) and
// deliver it ourselves through the same Resend API the rest of the app already
// uses. Supabase stays the source of truth for auth + verification — we only own
// the transport.
//
// IMPORTANT: after deploying this, Supabase's own "Confirm signup" / "Reset
// password" / "Change email" automatic emails must be DISABLED in the dashboard
// (Authentication → Emails) so users receive exactly one message (ours).
// ---------------------------------------------------------------------------

type AdminClient = SupabaseClient<Database>;

const EMAIL_FROM = 'Moche-AI <noreply@moche-ai.com>';
const SUPPORT_EMAIL = 'hostspark.org@gmail.com';

// Inline bell-igloo brand mark (mirrors components/Logo.tsx DomeMark), sized for
// email. Uses a fixed gradient id so multiple inlined copies never collide.
function brandMarkSvg(): string {
  return `
<svg viewBox="0 0 48 48" fill="none" width="40" height="40" role="img" aria-hidden="true" style="vertical-align:middle">
  <defs>
    <linearGradient id="mocheMailGrad" x1="6" y1="10" x2="42" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#33E6D4"/>
      <stop offset="1" stop-color="#7C8CFF"/>
    </linearGradient>
  </defs>
  <path d="M5 34h38" stroke="url(#mocheMailGrad)" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M8 34a16 16 0 0 1 32 0" stroke="url(#mocheMailGrad)" stroke-width="2.4" fill="none"/>
  <path d="M13 34a11 11 0 0 1 22 0" stroke="url(#mocheMailGrad)" stroke-width="1.7" opacity="0.7" fill="none"/>
  <path d="M18.5 34a5.5 5.5 0 0 1 11 0" stroke="url(#mocheMailGrad)" stroke-width="1.7" opacity="0.55" fill="none"/>
  <path d="M20.5 34v-4.2a3.5 3.5 0 0 1 7 0V34" fill="#33E6D4" opacity="0.9"/>
  <circle cx="24" cy="12" r="2.4" fill="#FF8A5C"/>
  <path d="M24 12v-4" stroke="#FF8A5C" stroke-width="1.6" stroke-linecap="round"/>
</svg>`.trim();
}

// Shared responsive, dark-on-brand email shell. `preheader` is the hidden inbox
// preview line. `intro`/`buttonLabel`/`url`/`outro` compose the body.
function renderAuthEmail(opts: {
  preheader: string;
  heading: string;
  intro: string;
  buttonLabel: string;
  url: string;
  outro: string;
}): { html: string; text: string } {
  const { preheader, heading, intro, buttonLabel, url, outro } = opts;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#070C14;color:#EAF1FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070C14;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0E1826;border:1px solid rgba(157,176,198,0.14);border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:10px;">${brandMarkSvg()}</td>
          <td style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#EAF1FA;">Moche<span style="color:#33E6D4;">.AI</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#EAF1FA;">${heading}</h1>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#9DB0C6;">${intro}</p>
      </td></tr>
      <tr><td align="center" style="padding:0 32px 8px 32px;">
        <a href="${url}" style="display:inline-block;background:#33E6D4;background-image:linear-gradient(115deg,#33E6D4 0%,#58C7E0 45%,#7C8CFF 100%);color:#04121A;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">${buttonLabel}</a>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <p style="margin:0 0 8px 0;font-size:12.5px;line-height:1.6;color:#5F7793;">Or paste this link into your browser:</p>
        <p style="margin:0 0 24px 0;font-size:12.5px;line-height:1.6;word-break:break-all;"><a href="${url}" style="color:#7C8CFF;">${url}</a></p>
        <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#9DB0C6;">${outro}</p>
      </td></tr>
      <tr><td style="padding:8px 32px 28px 32px;border-top:1px solid rgba(157,176,198,0.12);">
        <p style="margin:16px 0 4px 0;font-size:12px;line-height:1.6;color:#5F7793;">Need help? Reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#7C8CFF;">${SUPPORT_EMAIL}</a>.</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#5F7793;">Moche-AI · Built in Somerville, MA</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    '',
    intro.replace(/<[^>]+>/g, ''),
    '',
    `${buttonLabel}: ${url}`,
    '',
    outro.replace(/<[^>]+>/g, ''),
    '',
    `Need help? ${SUPPORT_EMAIL}`,
    'Moche-AI · Built in Somerville, MA',
  ].join('\n');

  return { html, text };
}

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.error('auth_email_no_resend_key', {});
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html, text });
    if (error) {
      log.error('auth_email_send_failed', { kind: subject, reason: error.message });
      return false;
    }
    return true;
  } catch (e) {
    log.error('auth_email_send_error', { error: String(e) });
    return false;
  }
}

// Generates a Supabase signup-confirmation link for a NEW user and emails it via
// Resend. Creates the (unconfirmed) auth user as a side effect. Returns the
// created user id on success so callers can record consent, or an error reason.
export async function createUserAndSendConfirmation(
  admin: AdminClient,
  params: { email: string; password: string; data: Record<string, unknown> },
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: params.email,
    password: params.password,
    options: {
      data: params.data,
      redirectTo: `${publicEnv.appUrl}/auth/callback`,
    },
  });

  if (error || !data?.properties?.hashed_token || !data.user) {
    const reason = error?.message ?? 'link_generation_failed';
    // "User already registered" is an expected, non-alarming case.
    log.warn('signup_link_generation_failed', { reason });
    return { ok: false, reason };
  }

  // Build a link that points straight at our own server-side callback with the
  // token-hash query params. We deliberately do NOT use `action_link` (the raw
  // Supabase /auth/v1/verify URL): that endpoint runs the implicit flow and
  // returns the session in the URL *hash fragment*, which a server route handler
  // can never read — so the session was never set and users bounced to
  // /login?error=auth_callback. Our callback's verifyOtp({token_hash,type})
  // branch consumes these query params server-side and sets the auth cookie.
  const confirmUrl =
    `${publicEnv.appUrl}/auth/callback` +
    `?token_hash=${encodeURIComponent(data.properties.hashed_token)}` +
    `&type=signup`;

  const { html, text } = renderAuthEmail({
    preheader: 'Confirm your email to activate your Moche-AI host account.',
    heading: 'Confirm your email',
    intro: 'Welcome to Moche-AI. Confirm your email address to activate your host account and start building your Property Brain.',
    buttonLabel: 'Confirm my email',
    url: confirmUrl,
    outro: 'This link expires in 24 hours. If you did not create a Moche-AI account, you can safely ignore this email.',
  });

  const sent = await send(params.email, 'Confirm your Moche-AI email', html, text);
  if (!sent) return { ok: false, reason: 'email_send_failed' };
  return { ok: true, userId: data.user.id };
}

// Generates a password-recovery link and emails it via Resend. Always resolves
// without revealing whether the email exists (callers return a generic message).
export async function sendPasswordReset(
  admin: AdminClient,
  params: { email: string; next?: string },
): Promise<void> {
  const next = params.next ?? '/reset/update';
  const redirectTo = `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: params.email,
    options: { redirectTo },
  });

  // Non-existent email → Supabase returns an error; swallow it to avoid
  // account enumeration. Nothing is sent, but the caller's response is identical.
  if (error || !data?.properties?.hashed_token) {
    log.info('password_reset_no_send', { reason: error?.message ?? 'no_link' });
    return;
  }

  // Same rationale as signup: point at our server-side callback with token-hash
  // query params (verifyOtp), not the implicit-flow action_link. Carry `next` so
  // the callback lands the user on the password-update screen after the session
  // cookie is set.
  const confirmUrl =
    `${publicEnv.appUrl}/auth/callback` +
    `?token_hash=${encodeURIComponent(data.properties.hashed_token)}` +
    `&type=recovery` +
    `&next=${encodeURIComponent(next)}`;

  const { html, text } = renderAuthEmail({
    preheader: 'Reset your Moche-AI password.',
    heading: 'Reset your password',
    intro: 'We received a request to reset the password for your Moche-AI host account. Click below to choose a new password.',
    buttonLabel: 'Reset my password',
    url: confirmUrl,
    outro: 'This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email — your password will not change.',
  });

  await send(params.email, 'Reset your Moche-AI password', html, text);
}
