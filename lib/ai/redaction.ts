// SINGLE SOURCE OF TRUTH for PII / secret redaction applied before content is
// sent to an EXTERNAL model router (OpenRouter). `lib/router/modelRouter.ts`
// imports `redactPII` from here — do not fork the logic.
//
// Design principles:
//   - Conservative and order-sensitive. Structured secrets (credit cards, labeled
//     codes) are matched BEFORE generic phone/long-digit rules so a card number is
//     never mangled into a "phone" or truncated by the digit fallback.
//   - Best-effort, not a guarantee. This reduces the blast radius of an accidental
//     PII leak on the external path; it is not a substitute for a signed DPA / ZDR
//     terms with the downstream provider.
//   - Pure string logic (no server-only import) so it is unit-testable.
//   - "Is this token a secret or ordinary prose?" is decided by ONE shared predicate
//     (`looksLikeCredentialValue`, from lib/brain/redact.ts). Two redactors that
//     disagreed about that question is precisely how a Wi-Fi password reached a
//     guest with a `[redacted]` marker printed next to it.

import { looksLikeCredentialValue } from '@/lib/brain/redact';

// --- Labeled secrets: password / passcode / access|door|gate|lock|wifi codes ---
//
// BUG HISTORY (do not reintroduce). The previous pattern was
//   /\b(...|wifi(?:\s?password)?|...|ssid|...)\b\s*[:=-]?\s*\S+/gi
// with the replacement `${label}: [redacted]`. Two defects made it leak the exact
// secret it existed to hide:
//
//  1. `\S+` matched the NEXT TOKEN, whatever it was — including the filler word
//     between the label and the value. "the password is Dennis2026!" matched
//     "password is" and became "the password: [redacted] Dennis2026!": a redaction
//     marker printed next to a fully intact credential.
//  2. Bare `wifi` was treated as a secret label, so "The WiFi network name is
//     CapeHouse-Guest" matched "WiFi network" and became "The WiFi: [redacted] name
//     is CapeHouse-Guest" — destroying the SSID sentence while protecting nothing.
//
// Because this redactor runs over the WHOLE message array on the external route
// (see redactMessages), the mangled string entered the model prompt, the model
// faithfully reproduced it, and it was then persisted to `messages` and
// `answer_cache` — so every later turn re-read the leak as "context".
//
// The pattern below fixes both: a required LINK consumes the filler, the value is
// captured as its own group, and `looksLikeCredentialValue` (shared with
// lib/brain/redact.ts, the single source of truth) rejects prose so
// "the door code is on the arrival card" survives intact.

/**
 * Labels that genuinely precede a secret.
 *
 * Bare `wifi` / `wi-fi` are deliberately ABSENT — that is the defect above. Only
 * `wifi password` (and friends) marks a secret; `WiFi` on its own overwhelmingly
 * introduces the NETWORK NAME, which `field_registry.json` types as
 * `sensitivity_tier: guest_after_verification`, not `stay_scoped_secret`.
 * lib/brain/redact.ts documents the same deliberate omission for SSIDs.
 *
 * The explicit `ssid` label is RETAINED because lib/ai/redaction.test.ts asserts it
 * ('redacts SSID/network key labels'). Per AGENTS.md boundary 7 that test is not
 * weakened here; the registry-vs-test tension is raised for owner review in the PR
 * instead. Keeping it is safe for the bug at hand: real host copy writes "Network
 * Name: X", which this pattern does not match.
 */
const SECRET_LABEL = String.raw`(?:passwords?|pass\s?phrases?|pass\s?codes?|access\s?codes?|door\s?codes?|gate\s?codes?|lock\s?codes?|key\s?codes?|entry\s?codes?|alarm\s?codes?|safe\s?codes?|wi-?\s?fi\s?passwords?|network\s?keys?|ssid|pin\s?codes?|pins?)`;

/** Filler between label and value: "is", "=", ":", "-", "is set to", or just space. */
const SECRET_LINK = String.raw`(?:\s*(?:is|are|was|=|:|-|\u2013|\u2014)\s*|\s+)(?:set\s+to\s+|currently\s+)?`;

/**
 * Stops a second label from being consumed AS the value. "door keypad code: 90210"
 * and "WiFi network name is X" both have another noun where the value would be; without
 * this the engine redacts the noun and leaves the real value in place.
 */
const NOT_ANOTHER_LABEL = String.raw`(?!(?:${SECRET_LABEL}|network|ssid|name|number)\b)`;

/** The value itself: quoted, backticked, or a bare non-sentence token. */
const SECRET_VALUE = String.raw`(?:"[^"\n]{1,64}"|'[^'\n]{1,64}'|\u201c[^\u201d\n]{1,64}\u201d|\`[^\`\n]{1,64}\`|[^\s.,;!?)\]\[]{1,64})`;

/** What replaces a labeled secret's value. Kept as `[redacted]` for stability. */
const SECRET_MASK = '[redacted]';

export const SECRET_LABEL_RE = new RegExp(
  `\\b(${SECRET_LABEL})${SECRET_LINK}${NOT_ANOTHER_LABEL}(${SECRET_VALUE})`,
  'gi',
);

/**
 * Repairs strings already mangled by the OLD pattern: `password: [redacted] is
 * Dennis2026!`. These live in `answer_cache` and `messages` and outlast the deploy
 * that fixes the regex, so the fix has to be retroactive on read rather than
 * depending on a data purge landing first.
 */
const POST_MASK_LEAK_RE = new RegExp(
  `\\b(${SECRET_LABEL})\\s*[:=-]?\\s*\\[redacted\\]${SECRET_LINK}(${SECRET_VALUE})`,
  'gi',
);

export const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Phone: a leading optional + then a run of digits/separators, 8+ digits total.
export const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

// Candidate credit-card: 13–19 digits allowing single spaces or dashes between
// groups. Validated with Luhn before redacting to avoid clobbering random IDs.
const CC_CANDIDATE_RE = /\b(?:\d[ -]?){13,19}\b/g;

// Fallback for any remaining long digit run (order numbers, account numbers).
export const LONG_DIGITS_RE = /\b\d{5,}\b/g;

// Best-effort US/EU-style street address: number + street words + a common suffix.
// Intentionally narrow to limit false positives on ordinary prose.
const STREET_SUFFIX =
  '(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|way|terrace|ter|circle|cir|square|sq|highway|hwy|parkway|pkwy|close|crescent|cres)';
const POSTAL_ADDRESS_RE = new RegExp(
  `\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,4}${STREET_SUFFIX}\\b\\.?`,
  'gi',
);

// Luhn checksum — the standard mod-10 validation used by payment card numbers.
export function luhnValid(digits: string): boolean {
  const n = digits.replace(/\D/g, '');
  if (n.length < 13 || n.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = n.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Redact obvious PII / secrets from a single string.
//
// Behavior is a strict superset of the original modelRouter.redactPII: the same
// email / phone / labeled-secret / long-digit rules still apply, plus credit-card
// (Luhn-verified) and best-effort postal-address redaction. Order is deliberate.
export function redactPII(text: string): string {
  if (!text) return text;
  return text
    // 0. Retroactive repair of pre-fix mangled text (see POST_MASK_LEAK_RE).
    .replace(POST_MASK_LEAK_RE, (_m, label: string) => `${label}: ${SECRET_MASK}`)
    // 1. Labeled secrets (door/access codes, WiFi passwords, PINs). The captured
    //    VALUE is masked — never the filler word or an adjacent noun — and prose
    //    values are left alone so useful answers survive.
    .replace(SECRET_LABEL_RE, (match, label: string, value: string) =>
      looksLikeCredentialValue(value) ? `${label}: ${SECRET_MASK}` : match,
    )
    // 2. Emails.
    .replace(EMAIL_RE, '[redacted-email]')
    // 3. Credit-card numbers (only when Luhn-valid so IDs are left intact).
    .replace(CC_CANDIDATE_RE, (m) => (luhnValid(m) ? '[redacted-cc]' : m))
    // 4. Postal addresses (best-effort).
    .replace(POSTAL_ADDRESS_RE, '[redacted-address]')
    // 5. Phone numbers (>= 8 digits once separators are stripped).
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 8 ? '[redacted-phone]' : m))
    // 6. Any remaining long digit run — keep the last two for support reference.
    .replace(LONG_DIGITS_RE, (m) => `***${m.slice(-2)}`);
}

// Convenience: redact every message's content, preserving roles. Used by the
// external routing path so the whole conversation is sanitized in one call.
export function redactMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
  return messages.map((m) => ({ ...m, content: redactPII(m.content) }));
}

// True if the string STILL appears to contain raw PII after a redaction pass.
// Used by the router's ZDR sanity check as defense-in-depth: if a redacted
// payload trips this, the external route is refused in favor of the in-house
// provider. Uses fresh, non-global regexes so `.test()` is stateless.
export function containsLikelyPII(text: string): boolean {
  if (!text) return false;
  const email = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (email.test(text)) return true;
  const ccMatches = text.match(/\b(?:\d[ -]?){13,19}\b/g) ?? [];
  return ccMatches.some((m) => luhnValid(m));
}
