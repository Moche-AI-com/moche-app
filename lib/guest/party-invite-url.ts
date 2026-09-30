// Browser-safe party-invite URL helpers.
//
// The token rides in the URL FRAGMENT, never the query string. Browsers do not
// send fragments to the server, so the token stays out of Vercel and Sentry
// request logs, Referer headers, and link-preview crawlers (iMessage and
// WhatsApp fetch the URL to build a preview; they only ever see /join).

export function partyJoinUrl(origin: string, slug: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/g/${encodeURIComponent(slug)}/join#t=${token}`;
}

export function readPartyTokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{16,512})(?:&|$)/.exec(hash);
  return m ? m[1] : null;
}

export function partyShareText(propertyName: string, checkOutIso: string, locale = 'en-US'): string {
  const until = new Date(checkOutIso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return `Join our stay at ${propertyName}! Check-in info, the house guide, local tips and host chat are all here (works until ${until}).`;
}

/** sms: deep link. '?&body=' is accepted by both iOS Messages and Android. */
export function smsShareHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}
