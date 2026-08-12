// Credential redaction for model-bound context (Directive §0.2 / §7).
//
// WHY THIS EXISTS
// The registry declares `wifi_password` and `door_code_or_entry_method` as
// `stay_scoped_secret`, and the brain_values envelope refuses to hold either as
// plaintext (CHECK brain_values_secret_never_plaintext). But the legacy
// free-text path — brain_items -> document_chunks -> concierge prompt — predates
// that envelope and has no field typing at all. A host who typed the Wi-Fi
// password into a `guest`-visible entry has it embedded, retrievable, and pasted
// into a model prompt on any loosely related question.
//
// This module is the containment layer for that. It does not fix the storage
// (that is the brain_items -> brain_values migration); it makes the *retrieval
// path* refuse to carry a credential-shaped value into a prompt or a guest
// answer, whatever the storage looks like underneath.
//
// DESIGN CONSTRAINTS
//  1. Redact the VALUE, keep the PROSE. "The WiFi password is hunter2, and the
//     router is in the hall closet" must still answer "where is the router".
//     Nuking the whole chunk would silently destroy legitimate content and make
//     the concierge worse in a way nobody would attribute to a security guard.
//  2. Fail closed on shape, not on certainty. A false positive costs a guest one
//     redacted token and a "ask your host / check your arrival message" answer.
//     A false negative leaks a door code to whoever holds a stay link.
//  3. Pure and synchronous. No model call, no network. A guard that can fail or
//     time out is a guard that gets bypassed under load.
//  4. Never log the matched value. `redactions` carries the LABEL only.

/** What replaces a redacted value inside the text handed to the model. */
export const REDACTION_PLACEHOLDER = '[stored securely - not available here]';

/**
 * Appended to the system prompt whenever anything was redacted, so the model
 * explains the omission instead of hallucinating a replacement code. Without
 * this, a model that sees a redaction marker will cheerfully invent "1234".
 */
export const REDACTION_INSTRUCTION = `
SECURITY: Some stored values were withheld from the context above and appear as "${REDACTION_PLACEHOLDER}". These are access credentials (Wi-Fi passwords, door codes, lock combinations, alarm codes). You do not have them and must never guess, reconstruct, or infer one. If the guest asks for a withheld credential, say it is released through their secure arrival details once their stay is verified, and offer to pass the request to the host. Answer any non-credential part of the question normally.`;

/** Nouns that mark the following token as a credential rather than prose. */
const SECRET_NOUN = String.raw`(?:pass\s?word|pass\s?phrase|passcode|pass|pin|code|combination|combo|key\s?code|keycode|key\s?pad|lock\s?box|lockbox)`;

/**
 * Qualifiers that make a bare noun unambiguous. `code` alone is far too broad
 * ("dress code", "area code", "code of conduct"), so a bare noun only matches
 * when the value that follows is itself credential-shaped (see BARE_VALUE).
 */
const SECRET_SUBJECT = String.raw`(?:wi-?\s?fi|wifi|wireless|network|ssid|internet|router|guest\s+network|door|front\s+door|back\s+door|gate|garage|lock|keypad|key\s?pad|smart\s?lock|entry|entrance|access|building|lobby|alarm|security|safe|vault|storage|shed|pool\s+gate|mailbox)`;

/** Filler between the noun and the value: "is", "=", ":", "-", "is set to". */
const LINK = String.raw`(?:\s*(?:is|are|was|=|:|-|\u2013|\u2014)\s*|\s+)(?:set\s+to\s+|currently\s+)?`;

/**
 * The credential itself. Deliberately narrow: a run of non-space characters
 * that is not obviously a sentence. Quoted, backticked and bare forms all
 * appear in real host copy.
 */
// The `[` exclusion is what makes the pass idempotent: without it, a second
// run matches the placeholder's own leading token and nests a placeholder
// inside a placeholder.
const VALUE = String.raw`(?:"[^"\n]{1,64}"|'[^'\n]{1,64}'|\u201c[^\u201d\n]{1,64}\u201d|\`[^\`\n]{1,64}\`|[^\s.,;!?)\]\[]{3,64})`;

/**
 * Words that turn a bare secret noun into ordinary prose. "code" is the whole
 * problem: "area code", "zip code", "dress code", "promo code" are all common in
 * host copy and none is a credential. Excluding them by the qualifier in front
 * is more robust than trying to tell 02114 from a door code by shape.
 */
const NOT_SECRET_QUALIFIER = String.raw`(?:area|zip|postal|post|dress|promo|promotional|discount|coupon|voucher|referral|country|city|state|region|airport|error|status|source|qr|bar|colour|color|tax|sort|swift|iata|icao|building|room|unit|apt|apartment|suite|flight|confirmation|booking|reservation)`;

/** A value shaped like a credential on its own: 4+ digits, or mixed alnum. */
const BARE_VALUE = String.raw`(?:"[^"\n]{3,64}"|'[^'\n]{3,64}'|\`[^\`\n]{3,64}\`|\d{4,12}|[A-Za-z0-9](?=[^\s]*\d)(?=[^\s]*[A-Za-z])[^\s.,;!?)\]]{3,63}|[#*]?\d{3,10}[#*]?)`;

/**
 * Stops a second secret noun from being consumed AS the value. "Front door
 * keypad code: 90210#" has two nouns in a row; without this the first pattern
 * redacts the word "code:" and leaves the actual code in place. The callback
 * cannot fix this after the fact, because returning the match unchanged does
 * not make the engine backtrack into a longer filler.
 */
const NOT_A_VALUE = String.raw`(?!${SECRET_NOUN}\b)`;

interface Rule {
  label: string;
  re: RegExp;
  /** Which capture group holds the value to blank out. */
  group: number;
}

// Ordered most-specific first. Every pattern captures the value in group 1 so a
// single replacement routine handles all of them.
const RULES: readonly Rule[] = [
  // "the WiFi password is hunter2" / "door code: 4821" / "gate PIN = 99#"
  {
    label: 'qualified_credential',
    re: new RegExp(`(?:${SECRET_SUBJECT})[\\s\\w]{0,16}?${SECRET_NOUN}${LINK}${NOT_A_VALUE}(${VALUE})`, 'gi'),
    group: 1,
  },
  // Reversed order: "password for the WiFi is hunter2", "code to the gate: 4821"
  {
    label: 'qualified_credential_reversed',
    re: new RegExp(`${SECRET_NOUN}\\s+(?:for|to|on)\\s+(?:the\\s+)?(?:${SECRET_SUBJECT})\\b${LINK}${NOT_A_VALUE}(${VALUE})`, 'gi'),
    group: 1,
  },
  // Bare noun, but only when the value itself looks like a credential.
  // Catches "Password: Sunset2024" without eating "the dress code is casual".
  {
    label: 'bare_credential',
    re: new RegExp(`(?<!\\b${NOT_SECRET_QUALIFIER}\\s)(?<!\\b${NOT_SECRET_QUALIFIER}-)\\b${SECRET_NOUN}${LINK}(${BARE_VALUE})`, 'gi'),
    group: 1,
  },
  // A labelled SSID is not a secret by registry typing (wifi_network_name is
  // guest_after_verification, not stay_scoped_secret), so it is NOT redacted.
  // Listed here only to document the deliberate omission.
];

export interface RedactionResult {
  text: string;
  /** Rule labels that fired, deduped. Safe to log: never contains the value. */
  redactions: string[];
}

/**
 * Blanks credential-shaped values out of a single block of text.
 *
 * Idempotent: running it over already-redacted text is a no-op, because the
 * placeholder contains spaces and brackets and so cannot itself match VALUE.
 */
export function redactCredentials(input: string): RedactionResult {
  if (!input) return { text: input, redactions: [] };

  let text = input;
  const fired = new Set<string>();

  for (const rule of RULES) {
    // Fresh lastIndex per call: these RegExps are module-level and /g.
    rule.re.lastIndex = 0;
    text = text.replace(rule.re, (match, ...groups) => {
      const value = groups[rule.group - 1];
      if (typeof value !== 'string' || value.length === 0) return match;
      // Idempotence: a second pass must not chew into a placeholder it already
      // wrote. The placeholder's own leading token ('[stored') is VALUE-shaped,
      // so this check is load-bearing, not defensive decoration.
      if (match.includes(REDACTION_PLACEHOLDER)) return match;
      if (isNotACredential(value)) return match;
      fired.add(rule.label);
      // Rebuild the match with the value swapped out, so the surrounding prose
      // ("The WiFi password is …") survives and the model can explain itself.
      const at = match.lastIndexOf(value);
      return match.slice(0, at) + REDACTION_PLACEHOLDER + match.slice(at + value.length);
    });
  }

  return { text, redactions: [...fired] };
}

/**
 * Values that are prose, not secrets. Keeps the guard from mangling sentences
 * like "the door code is on the arrival card" or "the WiFi password is in the
 * welcome book", which are useful answers and contain no credential.
 */
const PROSE_VALUES = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'by', 'not', 'no', 'none', 'n/a', 'na', 'tbd', 'unknown',
  'available', 'unavailable', 'posted', 'printed', 'written', 'listed', 'located', 'inside',
  'sent', 'shared', 'provided', 'given', 'emailed', 'texted', 'included', 'same', 'different',
  'open', 'unlocked', 'disabled', 'required', 'optional', 'free', 'public', 'private',
  'case-sensitive', 'casesensitive', 'lowercase', 'uppercase', 'below', 'above', 'attached',
  'and', 'or', 'but', 'with', 'without', 'your', 'our', 'their', 'this', 'that', 'these', 'those',
  'stored', 'securely',
]);

function isNotACredential(value: string): boolean {
  const bare = value.replace(/^["'`\u201c]|["'`\u201d]$/g, '').trim();
  if (bare.length === 0) return true;
  if (PROSE_VALUES.has(bare.toLowerCase())) return true;
  // Anything bracketed is our own marker or a template token, never a secret.
  if (bare.startsWith('[')) return true;
  // A sentence fragment, not a token.
  if (/\s/.test(bare) && bare.split(/\s+/).length > 3) return true;
  return false;
}

/**
 * Convenience wrapper for retrieval results: redacts each block, and reports
 * whether anything fired so the caller can append REDACTION_INSTRUCTION once
 * for the whole prompt rather than per chunk.
 */
export function redactBlocks(blocks: readonly string[]): { blocks: string[]; redactions: string[] } {
  const fired = new Set<string>();
  const out = blocks.map((b) => {
    const r = redactCredentials(b);
    for (const label of r.redactions) fired.add(label);
    return r.text;
  });
  return { blocks: out, redactions: [...fired] };
}
