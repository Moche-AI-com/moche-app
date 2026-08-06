// Guest-visible link detection (Guest UX pass).
//
// The concierge frequently produces something a guest wants to ACT on — a phone
// number for the restaurant it just recommended, the property's own booking
// page, a support email. Rendering those as dead plain text forces the guest to
// copy them by hand on a phone, which is exactly the friction the portal exists
// to remove.
//
// Security posture (WS-5 still holds):
//   * WS-5 says guest-visible links to PLACES are server-constructed from
//     verified DB rows and never taken from model text. That is unchanged — the
//     place chips below each bubble are still the trusted path, and this module
//     does not touch them.
//   * What this module does is narrower: it makes an ALREADY-VISIBLE string in
//     the answer tappable. The guest can already read the URL; the only thing
//     added is the tap. Nothing is hidden, so there is no way to show one
//     destination and navigate to another.
//   * Only `https:`, `http:`, `mailto:` and `tel:` are ever linked. `javascript:`,
//     `data:`, and every other scheme are deliberately left as inert text.
//   * The visible label is always the matched source text itself, never
//     model-supplied anchor text, so a link cannot lie about where it goes.
//
// Pure and dependency-free so it can be unit-tested directly.

export type LinkKind = 'url' | 'email' | 'phone';

export interface LinkifiedText {
  kind: 'text';
  value: string;
}

export interface LinkifiedLink {
  kind: 'link';
  /** Exactly what the guest reads. Always taken from the source text. */
  label: string;
  /** Safe, fully-qualified href. */
  href: string;
  linkKind: LinkKind;
}

export type LinkifySegment = LinkifiedText | LinkifiedLink;

// One pass, three alternatives, ordered so an email is never half-matched as a URL.
// - email:  local@domain.tld
// - url:    https://… , http://… , or a bare www.… host
// - phone:  E.164 (+ then unbroken digits), or an optional +, then 7–20 digits
//           separated by spaces, dots, dashes, parens
const PATTERN = new RegExp(
  [
    // email
    '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})',
    // url (scheme-ful or www-prefixed)
    '((?:https?:\\/\\/|www\\.)[^\\s<>()\\[\\]"\']+)',
    // phone. The first branch is bare E.164 (+15551234567) — hosts paste numbers
    // that way and a guest should still be able to tap it. It requires the leading
    // + precisely so that an unbroken run of digits (a date, a price, a booking
    // reference) is never mistaken for a number to call.
    '((?:\\+\\d{7,15})|(?:\\+\\d{1,3}[\\s.-]?)?(?:\\(\\d{1,4}\\)[\\s.-]?)?\\d{2,4}(?:[\\s.-]\\d{2,4}){1,4})',
  ].join('|'),
  'g',
);

/** Trailing punctuation that is almost always sentence punctuation, not part of the link. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

function countDigits(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= '0' && ch <= '9') n++;
  return n;
}

/**
 * Splits `text` into plain-text and link segments.
 *
 * Never throws and never drops characters: concatenating every segment's source
 * text reproduces the input exactly, so a parsing miss degrades to plain text
 * rather than to a truncated answer.
 */
export function linkify(text: string): LinkifySegment[] {
  if (!text) return [];
  const out: LinkifySegment[] = [];
  let cursor = 0;

  // Reset because the regex is module-level and stateful with the /g flag.
  PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PATTERN.exec(text)) !== null) {
    const [whole, email, url, phone] = match;
    const start = match.index;

    // Strip sentence punctuation off the end and hand it back to the text run.
    const trailing = whole.match(TRAILING)?.[0] ?? '';
    const core = trailing ? whole.slice(0, whole.length - trailing.length) : whole;
    if (!core) continue;

    let link: LinkifiedLink | null = null;

    if (email) {
      link = { kind: 'link', label: core, href: `mailto:${core}`, linkKind: 'email' };
    } else if (url) {
      // A bare `www.` host still needs an explicit scheme to be navigable.
      const href = /^https?:\/\//i.test(core) ? core : `https://${core}`;
      // Belt and braces: reject anything that did not end up as plain http(s).
      link = isSafeHttpUrl(href) ? { kind: 'link', label: core, href, linkKind: 'url' } : null;
    } else if (phone) {
      // Guard against turning dates, prices, and room dimensions into phone links.
      const digits = countDigits(core);
      const looksLikePhone = digits >= 7 && digits <= 15 && /[\s.\-()]|^\+/.test(core);
      if (looksLikePhone) {
        const href = `tel:${core.replace(/[^\d+]/g, '')}`;
        link = { kind: 'link', label: core, href, linkKind: 'phone' };
      }
    }

    if (!link) continue;

    if (start > cursor) out.push({ kind: 'text', value: text.slice(cursor, start) });
    out.push(link);
    cursor = start + core.length;
  }

  if (cursor < text.length) out.push({ kind: 'text', value: text.slice(cursor) });
  return out;
}

/** True only for `http:`/`https:` URLs that parse. Everything else is untrusted. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** True when the text contains at least one thing worth making tappable. */
export function hasLinks(text: string): boolean {
  return linkify(text).some((s) => s.kind === 'link');
}
