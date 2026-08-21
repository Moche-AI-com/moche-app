import 'server-only';
import { serverEnv, publicEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { TRANSACTIONAL_SENDER } from '@/lib/mail/senders';

// Pre-launch early-access thank-you, sent after someone joins the list from the
// /welcome holding page or the landing form. Confirms their spot, states the
// launch date, and makes clear no payment is due before launch.
//
// Transport mirrors lib/auth/auth-email.ts (same Resend client pattern and the
// monitored transactional sender). The branded shell is duplicated here on
// purpose rather than imported: renderAuthEmail is private to the auth module,
// and this marketing mail should not couple itself to the auth flow.

const EMAIL_FROM = TRANSACTIONAL_SENDER.from;

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

function renderEarlyAccessEmail(opts: { heading: string; firstName: string }): {
  html: string;
  text: string;
} {
  const { heading, firstName } = opts;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#070C14;color:#EAF1FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">You are on the Moche-AI early-access list. We launch January 1, 2027.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070C14;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0E1826;border:1px solid rgba(157,176,198,0.14);border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px 32px;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#EAF1FA;">Moche<span style="color:#33E6D4;">-AI</span></td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#EAF1FA;">${heading}</h1>
        <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#9DB0C6;">${greeting}</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#9DB0C6;">Thanks for signing up for early access. Your spot is confirmed. We are putting the finishing touches on Moche-AI and we go live on <strong style="color:#EAF1FA;">January&nbsp;1,&nbsp;2027</strong> — we will email you the moment your workspace is ready.</p>
      </td></tr>
      <tr><td align="center" style="padding:0 32px 8px 32px;">
        <a href="${publicEnv.appUrl}/" style="display:inline-block;background:#33E6D4;background-image:linear-gradient(115deg,#33E6D4 0%,#58C7E0 45%,#7C8CFF 100%);color:#04121A;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">See what is coming</a>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#9DB0C6;">No payment is due until launch, and early hosts lock in founding rates. If you did not sign up for Moche-AI, you can safely ignore this email.</p>
      </td></tr>
      <tr><td style="padding:8px 32px 28px 32px;border-top:1px solid rgba(157,176,198,0.12);">
        <p style="margin:16px 0 4px 0;font-size:12px;line-height:1.6;color:#5F7793;">Need help? Reach us at <a href="mailto:hostspark.org@gmail.com" style="color:#7C8CFF;">hostspark.org@gmail.com</a>.</p>
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
    greeting,
    '',
    'Thanks for signing up for early access to Moche-AI. Your spot is confirmed.',
    '',
    'We are putting the finishing touches on the product and we go live on January 1, 2027 — we will email you the moment your workspace is ready.',
    '',
    'No payment is due until launch, and early hosts lock in founding rates.',
    '',
    `See what is coming: ${publicEnv.appUrl}/`,
    '',
    '— The Moche-AI team',
  ].join('\n');

  return { html, text };
}

// Fire-and-forget by design: callers ignore the boolean and only log, so an
// email failure never loses a signup.
export async function sendEarlyAccessThanks(params: {
  email: string;
  name?: string | null;
}): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.warn('early_access_no_resend_key', {});
    return false;
  }
  try {
    const firstName = (params.name ?? '').trim().split(/\s+/)[0] || '';
    const safeName = firstName ? escapeHtml(firstName) : '';
    const heading = safeName ? `Thanks, ${safeName} — you are on the list` : 'Thanks — you are on the list';
    const { html, text } = renderEarlyAccessEmail({ heading, firstName: safeName });

    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.email,
      subject: 'You are on the Moche-AI early-access list',
      html,
      text,
    });
    if (error) {
      log.error('early_access_email_failed', { reason: error.message });
      return false;
    }
    return true;
  } catch (e) {
    log.error('early_access_email_error', { error: String(e) });
    return false;
  }
}
