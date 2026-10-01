// Browser-safe party-invite URL helpers.
//
// The token rides in the URL FRAGMENT, never the query string. Browsers do not
// send fragments to the server, so the token stays out of Vercel and Sentry
// request logs, Referer headers, and link-preview crawlers (iMessage and
// WhatsApp fetch the URL to build a preview; they only ever see /join).

import type { PortalT } from './portal-strings';

export function partyJoinUrl(origin: string, slug: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/g/${encodeURIComponent(slug)}/join#t=${token}`;
}

export function readPartyTokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{16,512})(?:&|$)/.exec(hash);
  return m ? m[1] : null;
}

/** The message a guest shares, in the sender's language with a local date. */
export function partyShareText(t: PortalT, propertyName: string, checkOutIso: string, locale?: string | null): string {
  const when = new Date(checkOutIso);
  let date: string;
  try {
    date = when.toLocaleDateString(locale && locale !== 'auto' ? locale : 'en-US', { month: 'short', day: 'numeric' });
  } catch {
    date = when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return t('inviteShareMessage', { property: propertyName, date });
}

/** sms: deep link. '?&body=' is accepted by both iOS Messages and Android. */
export function smsShareHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}
