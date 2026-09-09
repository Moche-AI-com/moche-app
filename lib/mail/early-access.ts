import 'server-only';
import { serverEnv, publicEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { TRANSACTIONAL_SENDER } from '@/lib/mail/senders';

// Public-beta thank-you, sent after someone joins the list from the /welcome
// page or the landing form. Confirms the product is open now, states the
// official launch date, and makes clear the free plan needs no card.
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
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">Moche-AI is open in public beta. Official launch January 1, 2027.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070C14;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0E1826;border:1px solid rgba(157,176,198,0.14);border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px 32px;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#EAF1FA;">Moche<span style="color:#33E6D4;">-AI</span></td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#EAF1FA;">${heading}</h1>
        <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:#9DB0C6;">${greeting}</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#9DB0C6;">Thanks for signing up for early access. Moche-AI is now open in public beta: you can create your account, build your Property Brain, and publish your guest portal today. Our official launch is <strong style="color:#EAF1FA;">January&nbsp;1,&nbsp;2027</strong>, and we are improving the product every week until then.</p>
      </td></tr>
      <tr><td align="center" style="padding:0 32px 8px 32px;">
        <a href="${publicEnv.appUrl}/signup" style="display:inline-block;background:#33E6D4;background-image:linear-gradient(115deg,#33E6D4 0%,#58C7E0 45%,#7C8CFF 100%);color:#04121A;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">Start building free</a>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <p style="margin:0 0 24px 0;font-size:13px;line-height:1.6;color:#9DB0C6;">The free plan includes one property and a live guest portal, with no card required, and early hosts lock in founding rates. If you did not sign up for Moche-AI, you can safely ignore this email.</p>
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
    'Thanks for signing up for early access to Moche-AI.',
    '',
    'Moche-AI is now open in public beta: you can create your account, build your Property Brain, and publish your guest portal today. Our official launch is January 1, 2027.',
    '',
    'The free plan includes one property and a live guest portal, with no card required, and early hosts lock in founding rates.',
    '',
    `Start building free: ${publicEnv.appUrl}/signup`,
    '',
    '— The Moche-AI team',
  ].join('\n');

  return { html, text };
}

// Best-effort transport: callers await this but a false result never loses a signup.
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
    const heading = safeName ? `Thanks, ${safeName} — you are in` : 'Thanks — you are in';
    const { html, text } = renderEarlyAccessEmail({ heading, firstName: safeName });

    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      replyTo: TRANSACTIONAL_SENDER.replyTo,
      to: params.email,
      subject: 'Moche-AI is open — start building today',
      html,
      text,
    });
    if (error || !data?.id) {
      log.error('early_access_email_failed', {});
      return false;
    }
    return true;
  } catch {
    log.error('early_access_email_error', {});
    return false;
  }
}
