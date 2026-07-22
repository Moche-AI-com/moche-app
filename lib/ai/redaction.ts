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

// --- Labeled secrets: password / passcode / access|door|gate|lock|wifi codes ---
// Extends the original SECRET_LABEL_RE with wifi/network/ssid and gate/lock/key
// variants. Captures the label and replaces only the value after it.
export const SECRET_LABEL_RE =
  /\b(passwords?|pass\s?codes?|access\s?codes?|door\s?codes?|gate\s?codes?|lock\s?codes?|key\s?codes?|wifi(?:\s?password)?|wi-fi(?:\s?password)?|network\s?key|ssid|pin(?:\s?code)?)\b\s*[:=-]?\s*\S+/gi;

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
    // 1. Labeled secrets (wifi/door/access codes, passwords, PINs).
    .replace(SECRET_LABEL_RE, (_m, label: string) => `${label}: [redacted]`)
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
