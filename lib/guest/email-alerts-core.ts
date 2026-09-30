// Pure helpers for guest email alerts (no server imports, unit-testable).

export const GUEST_EMAIL_CONFIRM_TTL_MS = 30 * 60 * 1000;

/** Lowercased, trimmed address, or null when it is not a plausible email. */
export function normalizeGuestEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length < 6 || value.length > 254) return null;
  return /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/.test(value) ? value : null;
}

/** Masked display form, e.g. j•••@gmail.com. Never shows the full local part. */
export function maskGuestEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  return `${local[0]}•••@${domain}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Minimal standalone page for the confirm / unsubscribe links. Optional POST
 * form so link scanners that prefetch GET URLs cannot consume the token. */
export function guestEmailPage(p: { title: string; body: string; action?: { url: string; token: string; label: string }; link?: { href: string; label: string } }): string {
  const form = p.action
    ? `<form method="post" action="${escapeHtml(p.action.url)}"><input type="hidden" name="token" value="${escapeHtml(p.action.token)}"><button type="submit">${escapeHtml(p.action.label)}</button></form>`
    : '';
  const link = p.link ? `<p><a href="${escapeHtml(p.link.href)}">${escapeHtml(p.link.label)}</a></p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(p.title)} · Moche-AI</title>`
    + `<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f1115;color:#e8e8ea;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:1.5rem}main{max-width:26rem;text-align:center}button{font:inherit;padding:.7rem 1.4rem;border-radius:.6rem;border:0;background:#e8e8ea;color:#0f1115;cursor:pointer}a{color:#9ecbff}</style></head>`
    + `<body><main><h1 style="font-size:1.35rem">${escapeHtml(p.title)}</h1><p>${escapeHtml(p.body)}</p>${form}${link}</main></body></html>`;
}
