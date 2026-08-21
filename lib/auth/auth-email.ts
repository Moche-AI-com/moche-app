import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { serverEnv, publicEnv } from '@/lib/env';
import { log } from '@/lib/log';
import {
  CAPABILITIES,
  MEMBER_ROLES,
  type CapabilitySet,
  type InvitableRole,
} from '@/lib/auth/member-capabilities';

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
  <path d="M13 34a11 11 0 0 1 22 0" stroke="url(#mocheMailGrad)" stroke-width="2.4" opacity="0.5" fill="none"/>
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
  detailsHtml?: string;
  detailsText?: string;
}): { html: string; text: string } {
  const { preheader, heading, intro, buttonLabel, url, outro, detailsHtml = '', detailsText = '' } = opts;
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
        ${detailsHtml}
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
    detailsText,
    detailsText ? '' : '',
    `${buttonLabel}: ${url}`,
    '',
    outro.replace(/<[^>]+>/g, ''),
    '',
    `Need help? ${SUPPORT_EMAIL}`,
    'Moche-AI · Built in Somerville, MA',
  ].join('\n');

  return { html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character] ?? character;
  });
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

  const { html, text } = renderConfirmationEmail(confirmUrl);

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

/**
 * Sends the only copy of a member-invitation URL. The raw token is intentionally
 * accepted only here, where it becomes part of the email link; callers persist
 * its hash and never include the raw token in logs or audit metadata.
 */
export async function sendMemberInvite(params: {
  email: string;
  inviterName: string;
  accountName: string;
  role: InvitableRole;
  capabilities: CapabilitySet;
  token: string;
}): Promise<boolean> {
  const role = MEMBER_ROLES.find((candidate) => candidate.id === params.role);
  const roleLabel = role?.label ?? 'Team member';
  const capabilityLabels = CAPABILITIES
    .filter((capability) => params.capabilities[capability.key])
    .map((capability) => capability.label);
  const safeInviter = escapeHtml(params.inviterName || 'Your host');
  const safeAccount = escapeHtml(params.accountName);
  const safeRole = escapeHtml(roleLabel);
  const subjectAccount = params.accountName.replace(/[\r\n]/g, ' ').trim() || 'your account';
  const capabilityItems =
    capabilityLabels.length > 0
      ? capabilityLabels.map((label) => `<li style="margin:0 0 5px 0;">${escapeHtml(label)}</li>`).join('')
      : '<li style="margin:0;">No actions are enabled yet.</li>';
  const inviteUrl = `${publicEnv.appUrl}/invite/${encodeURIComponent(params.token)}`;

  const { html, text } = renderAuthEmail({
    preheader: 'You have a Moche.AI account invitation.',
    heading: 'You’re invited to Moche.AI',
    intro: `${safeInviter} invited you to join ${safeAccount} as a ${safeRole}.`,
    detailsHtml: `<div style="margin:-8px 0 24px 0;padding:14px 16px;background:#122036;border:1px solid rgba(157,176,198,0.14);border-radius:10px;">
      <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#EAF1FA;">You’ll be able to:</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.55;color:#9DB0C6;">${capabilityItems}</ul>
    </div>`,
    detailsText: `You’ll be able to:\n${capabilityLabels.length ? capabilityLabels.map((label) => `• ${label}`).join('\n') : '• No actions are enabled yet.'}`,
    buttonLabel: 'Accept your invitation',
    url: inviteUrl,
    outro: 'This link expires in 7 days. Sign in with the invited email address, or create an account and agree to the terms to join.',
  });

  return send(params.email, `You’re invited to ${subjectAccount} on Moche.AI`, html, text);
}

// Sends the pre-launch early-access thank-you after someone joins the list from
// the /welcome holding page or the landing form. Confirms their spot, sets the
// launch date, and makes clear no payment is due before launch. Uses the shared
// transactional sender — the monitored, time-capable path.
export async function sendEarlyAccessThanks(params: {
  email: string;
  name?: string | null;
}): Promise<boolean> {
  const firstName = (params.name ?? '').trim().split(/\s+/)[0] || '';
  const safeName = firstName ? escapeHtml(firstName) : '';
  const heading = safeName ? `Thanks, ${safeName} — you are on the list` : 'Thanks — you are on the list';
  const { html, text } = renderAuthEmail({
    preheader: 'You are on the Moche-AI early-access list. We launch January 1, 2027.',
    heading,
    intro:
      'Your spot is confirmed. We are putting the finishing touches on Moche-AI and we go live on January 1, 2027 — we will email you the moment your workspace is ready.',
    buttonLabel: 'See what is coming',
    url: `${publicEnv.appUrl}/`,
    outro:
      'No payment is due until launch, and early hosts lock in founding rates. If you did not sign up for Moche-AI, you can safely ignore this email.',
  });
  return send(params.email, 'You are on the Moche-AI early-access list', html, text);
}


// Signup confirmation email. Branded concierge design (see emails/confirm-account.html).
// Uses the inline brandMarkSvg() for the logo so no cid: attachment is required for
// images to render — Resend sends only from/to/subject/html/text here.
function renderConfirmationEmail(url: string): { html: string; text: string } {
  const preheader =
    'Your Moche-AI concierge is ready. Confirm your account and give every guest instant, property-approved answers.';
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Activate your Moche-AI concierge</title>
<style>
html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;}
*{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
table,td{border-collapse:collapse!important;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;}
img{border:0;outline:none;text-decoration:none;line-height:100%;-ms-interpolation-mode:bicubic;}
a{text-decoration:none;}
@media screen and (max-width:480px){
.moche-mobile-padding{padding-left:24px!important;padding-right:24px!important;}
.moche-heading{font-size:27px!important;}
.moche-hero-image{height:190px!important;}
.moche-hero-panel{padding-left:20px!important;padding-right:20px!important;}
.moche-button{padding-left:21px!important;padding-right:23px!important;font-size:15px!important;}
.moche-feature-cell{padding-left:3px!important;padding-right:3px!important;}
.moche-feature-badge{width:46px!important;height:46px!important;line-height:46px!important;font-size:12px!important;}
.moche-feature-title{font-size:11px!important;}
.moche-feature-copy{font-size:10px!important;}
}
</style>
</head>
<body id="moche-body" style="margin:0;padding:0;word-spacing:normal;background-color:#FFF7E6;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:#FFF7E6;">
<tr><td align="center" style="padding:34px 12px 44px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background-color:#FFFDF8;border-radius:24px;overflow:hidden;box-shadow:0 14px 38px rgba(7,11,20,0.14);">
<tr><td align="center" style="background-color:#070B14;padding:35px 40px 31px;border-radius:24px 24px 0 0;">
<div style="display:inline-block;margin:0 auto 18px;padding:10px;background-color:#FFFFFF;border-radius:23px;">${brandMarkSvg()}</div>
<h1 class="moche-heading" style="margin:0;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:31px;line-height:1.22;font-weight:800;letter-spacing:-0.4px;">Your digital front desk is ready.</h1>
<p style="margin:11px 0 0;color:#9AE8E5;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;">Confirm your account and put trusted property knowledge at every guest’s fingertips.</p>
</td></tr>
<tr><td style="height:5px;line-height:5px;font-size:0;background-color:#52CBDE;background-image:linear-gradient(90deg,#33E6D3 0%,#52CBDE 45%,#7698F9 100%);">&nbsp;</td></tr>
<tr><td style="background-color:#10283B;"><img class="moche-hero-image" src="https://www.moche-ai.com/_next/image?url=%2F_next%2Fstatic%2Fimmutable%2Fmedia%2Fportal-hero.21_412qeapbd1.jpg&w=1200&q=85" width="600" height="230" alt="The Moche-AI digital concierge guest experience" style="display:block;width:100%;max-width:600px;height:230px;object-fit:cover;background-color:#10283B;color:#C6D7E1;font-family:Arial,Helvetica,sans-serif;font-size:14px;"></td></tr>
<tr><td class="moche-hero-panel" style="padding:0 32px;background-color:#10283B;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:#17384D;border-left:1px solid #2A5065;border-right:1px solid #2A5065;">
<tr><td width="40" align="center" valign="middle" style="padding:14px 0 14px 14px;"><span style="display:inline-block;width:10px;height:10px;line-height:10px;background-color:#33E6D3;border-radius:10px;">&nbsp;</span></td>
<td valign="middle" style="padding:12px 10px;"><p style="margin:0 0 2px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;font-weight:700;">Concierge status: ready to check in</p><p style="margin:0;color:#A9C4CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;">Available around the clock with answers you approve.</p></td>
<td align="right" valign="middle" style="padding:12px 16px 12px 5px;"><span style="display:inline-block;padding:5px 9px;color:#9AE8E5;background-color:#21485A;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1;font-weight:800;letter-spacing:0.7px;">ONLINE</span></td></tr>
</table></td></tr>
<tr><td class="moche-mobile-padding" style="padding:36px 44px 8px;background-color:#FFFDF8;">
<p style="margin:0 0 10px;color:#356FC3;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;">One final step</p>
<h2 style="margin:0 0 15px;color:#173747;font-family:Arial,Helvetica,sans-serif;font-size:23px;line-height:1.3;font-weight:800;letter-spacing:-0.2px;">Open the door to better guest stays.</h2>
<p style="margin:0 0 22px;color:#53636B;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.72;">Confirm your email to activate Moche-AI. Then add the property details guests ask about most—check-in, Wi-Fi, parking, house rules, appliances, and local recommendations.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:#EDF9F6;border:1px solid #D3F0E8;border-radius:14px;">
<tr><td width="43" align="center" valign="middle" style="padding:15px 0 15px 14px;"><span style="display:inline-block;width:26px;height:26px;color:#FFFFFF;background-color:#279F9E;border-radius:26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;font-weight:800;text-align:center;">✓</span></td>
<td style="padding:15px 16px 15px 10px;"><p style="margin:0;color:#315C62;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.62;">Moche-AI answers from your property information and keeps you in control of what guests see.</p></td></tr>
</table></td></tr>
<tr><td align="center" style="padding:29px 30px 11px;background-color:#FFFDF8;">
<a href="${url}" class="moche-button" style="display:inline-block;padding:0 29px;color:#FFFFFF;background-color:#4F80DD;background-image:linear-gradient(90deg,#3A9FC9 0%,#4F80DD 100%);border-radius:999px;box-shadow:0 8px 20px rgba(55,113,220,0.24);font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:60px;font-weight:800;white-space:nowrap;">Activate my concierge</a>
<p style="margin:16px 0 0;color:#849095;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">This secure confirmation link can be used once.</p>
</td></tr>
<tr><td class="moche-mobile-padding" style="padding:25px 44px 22px;background-color:#FFFDF8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-top:1px solid #E9E2D4;">
<tr>
<td class="moche-feature-cell" width="33.33%" align="center" valign="top" style="padding:24px 6px 4px;"><div class="moche-feature-badge" style="display:inline-block;width:52px;height:52px;color:#287F92;background-color:#E7F8F8;border:1px solid #BFE9E8;border-radius:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:52px;font-weight:800;text-align:center;">24/7</div><p class="moche-feature-title" style="margin:10px 0 3px;color:#173747;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;font-weight:800;">Always available</p><p class="moche-feature-copy" style="margin:0;color:#738087;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">Answers day or night</p></td>
<td class="moche-feature-cell" width="33.33%" align="center" valign="top" style="padding:24px 6px 4px;"><div class="moche-feature-badge" style="display:inline-block;width:52px;height:52px;color:#FFFFFF;background-color:#3486C9;border:1px solid #3486C9;border-radius:16px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:52px;font-weight:800;text-align:center;">✓</div><p class="moche-feature-title" style="margin:10px 0 3px;color:#173747;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;font-weight:800;">Host approved</p><p class="moche-feature-copy" style="margin:0;color:#738087;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">Your facts, your voice</p></td>
<td class="moche-feature-cell" width="33.33%" align="center" valign="top" style="padding:24px 6px 4px;"><div class="moche-feature-badge" style="display:inline-block;width:52px;height:52px;color:#506FD1;background-color:#EEF0FF;border:1px solid #D3D9FA;border-radius:16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:52px;font-weight:800;text-align:center;">5★</div><p class="moche-feature-title" style="margin:10px 0 3px;color:#173747;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;font-weight:800;">Guest focused</p><p class="moche-feature-copy" style="margin:0;color:#738087;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">Less friction, better stays</p></td>
</tr></table></td></tr>
<tr><td class="moche-mobile-padding" style="padding:0 44px 36px;background-color:#FFFDF8;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:#F5F2EA;border-radius:12px;">
<tr><td style="padding:14px 16px;"><p style="margin:0;color:#707675;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.66;word-break:break-all;"><strong style="color:#455158;">Having trouble with the button?</strong><br>Copy and paste this secure link into your browser:<br><a href="${url}" style="color:#356FC3;text-decoration:underline;">${url}</a></p></td></tr>
</table></td></tr>
<tr><td align="center" style="background-color:#070B14;padding:27px 40px 29px;border-radius:0 0 24px 24px;">
<span style="display:inline-block;margin:0 auto 12px;padding:6px;background-color:#FFFFFF;border-radius:10px;">${brandMarkSvg()}</span>
<p style="margin:0 0 7px;color:#C6D9D8;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">You’re receiving this because you signed up for <a href="https://www.moche-ai.com" style="color:#9AE8E5;text-decoration:none;font-weight:700;">Moche-AI</a>.</p>
<p style="margin:0;color:#839AA5;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.65;">If you did not create this account, you can safely ignore this email.<br>© 2026 Moche-AI · Better stays, fewer questions.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    'Your digital front desk is ready.',
    '',
    'Confirm your email to activate Moche-AI, then add the property details guests ask about most (check-in, Wi-Fi, parking, house rules, appliances, and local recommendations).',
    '',
    `Activate my concierge: ${url}`,
    '',
    'This secure confirmation link can be used once.',
    '',
    'If you did not create this account, you can safely ignore this email.',
    '© 2026 Moche-AI · Better stays, fewer questions.',
  ].join('\n');
  return { html, text };
}
