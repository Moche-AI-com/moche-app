// Pure helpers for notification delivery state. No I/O, safe to unit test.

export type DeliveryChannel = 'in_app' | 'push' | 'sms' | 'email' | 'voice';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'suppressed' | 'skipped';
export type Urgency = 'p1' | 'p2' | 'p3' | 'p4';

// Terminal states share the top rank so an out-of-order callback never
// downgrades them (e.g. a late `sent` after `delivered`).
const RANK: Record<DeliveryStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: 2,
  suppressed: 2,
  skipped: 2,
};

export function shouldAdvanceStatus(current: DeliveryStatus, next: DeliveryStatus): boolean {
  return (RANK[next] ?? -1) > (RANK[current] ?? -1);
}

export function mapTwilioStatus(
  raw: string,
  errorCode: string | null,
): { status: DeliveryStatus; reason: string | null } | null {
  const status = raw.trim().toLowerCase();
  switch (status) {
    case 'sending':
    case 'sent':
      return { status: 'sent', reason: null };
    case 'delivered':
    case 'read':
      return { status: 'delivered', reason: null };
    case 'undelivered':
    case 'failed': {
      const code = errorCode && /^\d{1,6}$/.test(errorCode) ? errorCode : null;
      return { status: 'failed', reason: code ? `twilio_${code}` : `twilio_${status}` };
    }
    case 'canceled':
      return { status: 'failed', reason: 'twilio_canceled' };
    default:
      // queued / accepted / scheduled / unknown: nothing to advance.
      return null;
  }
}

// Notification links are always relative dashboard paths. Anything else
// (absolute URLs, protocol-relative, backslashes, control chars) falls back.
export function safeDashboardPath(link: string | null | undefined): string {
  const fallback = '/dashboard';
  if (typeof link !== 'string' || link.length === 0 || link.length > 2000) return fallback;
  if (!/^\/dashboard(?:[/?#]|$)/.test(link)) return fallback;
  if (/[\\\u0000-\u001f]/.test(link) || link.includes('//')) return fallback;
  return link;
}

// Absolute app URL for a fixed server route. HTTPS only, no credentials;
// returns null when the app URL is unusable so callers fall back safely.
export function appRouteUrl(appUrl: string, path: string): string | null {
  try {
    const base = new URL(appUrl);
    if (base.protocol !== 'https:' || base.username || base.password) return null;
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

// Reads the conversation id out of a host conversation deep link, e.g.
// /dashboard/properties/:id/stays/:id/conversations/:id?message=:id
export function conversationIdFromLink(link: string | null | undefined): string | null {
  if (typeof link !== 'string') return null;
  const match = /\/conversations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)/i.exec(link);
  return match ? match[1].toLowerCase() : null;
}
