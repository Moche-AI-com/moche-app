// #195 launch: guest messages that need the host NOW. Pure, no I/O.
//
// Life-safety phrases mirror lib/guest/concierge.ts EMERGENCY_PATTERNS, plus the
// property hazards and lockouts a host must act on immediately. A match marks
// the alert P1: it skips the SMS caps, says URGENT, and gets the 5/10-minute
// reminder ladder. Common false alarms (fireplace, fire pit, "can I smoke",
// "gas station", "emergency contact") are excluded. A false positive costs one
// extra text; a false negative can leave a guest in danger, so err toward match.

const URGENT_PATTERNS: RegExp[] = [
  /\b(carbon monoxide|break[- ]?in|intruder|burglar|bleeding|unconscious|heart attack|can['’]?t breathe|ambulance|assault|injur(?:ed|y)|overdose|seizure)\b/i,
  /\bfire\b(?!\s*(?:pit|place|wood|works?|stick|starters?|tv))/i,
  /\bemergency\b(?!\s+(?:contact|number|exit|kit|info|information|phone))/i,
  /\b(?:there['’]?s|there\s+is|i\s+see|i\s+smell|smells?\s+like|full\s+of|lots\s+of)\s+smoke\b/i,
  /\b(?:smoke|fire|co|carbon monoxide)\s+(?:alarm|detector)s?\s+(?:is\s+|are\s+)?(?:going\s+off|beeping|sounding|ringing)\b/i,
  /\bgas\s+(?:leak|smell)\b|\bsmell(?:s|ing)?\s+(?:of\s+|like\s+)?gas\b/i,
  /\b(?:flood(?:ing|ed)?|burst\s+pipe|water\s+(?:leak(?:ing)?|everywhere|pouring|coming\s+(?:in|through)))\b/i,
  /\b(?:locked\s+out|can['’]?t\s+get\s+in|cannot\s+get\s+in)\b/i,
];

/** True when any of the given texts (e.g. the original and its host translation) reads as urgent. */
export function isUrgentGuestMessage(...texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => {
    if (typeof text !== 'string' || text.length === 0) return false;
    const sample = text.slice(0, 2000);
    return URGENT_PATTERNS.some((re) => re.test(sample));
  });
}

/** Shown to the guest in Host Chat when their message is flagged urgent. */
export const EMERGENCY_GUEST_NOTICE =
  'If anyone is in danger, call your local emergency number now (911 in the US, 112 in the EU/UK). We have marked this message urgent for your host.';
