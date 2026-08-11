export type FactSensitivity = 'normal' | 'sensitive';

// Deterministic safeguards: these are routing hints, not a permission decision.
// Any sensitive source fact remains host-only and is never auto-proposed guest-visible.
const SENSITIVE_PATTERNS = [
  /\b(?:door|lock|gate)\s*(?:code|pin|passcode)\b/i,
  /\bwi[ -]?fi\s*(?:password|passphrase|key)\b/i,
  /\b(?:alarm|security)\s*(?:code|pin|passcode)\b/i,
  /\bsafe\s*(?:combination|code|pin)\b/i,
  /\b(?:vendor|supplier)\s*(?:account|acct)\s*(?:number|no\.?|#)\b/i,
];

export function classifyFactSensitivity(label: string, value: unknown): FactSensitivity {
  const text = `${label} ${typeof value === 'string' ? value : JSON.stringify(value ?? '')}`;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text)) ? 'sensitive' : 'normal';
}
