// Credential policy: Moche-AI never stores or recites door/entry codes or Wi-Fi
// passwords.
//
// - Door/entry code questions are detected here and escalated to the host by
//   app/api/guest/[slug]/chat/route.ts BEFORE retrieval or any model call.
// - Wi-Fi password questions are already handled inside the concierge by
//   lib/guest/wifi-instructions.ts (host-written location guidance only, and it
//   deliberately never suggests a 'typical' location). This module only
//   classifies them so callers do not intercept them.
//
// Pure and deterministic so the answer never depends on what a model decides.

import { partyT } from './party-strings';

export type CredentialKind = 'wifi_password' | 'door_code';

const DOOR_PATTERNS: RegExp[] = [
  /\b(door|entry|entrance|gate|lock ?box|keypad|smart ?lock|building|garage|front)\s*(code|pin|combo|combination|passcode)\b/i,
  /\b(code|pin|combo|combination|passcode)\s+(for|to|on)\s+(the\s+)?(door|gate|lock ?box|keypad|building|garage|front door|house|unit)\b/i,
  /\b(locked out|can[’']?t get in|cannot get in|how do i get in)\b/i,
];

const WIFI_PATTERNS: RegExp[] = [
  /\b(wi-?fi|wireless|internet|network)\s*(password|pass|key|code|pw)\b/i,
  /\b(password|passcode|key|code)\s+(for|to)\s+(the\s+)?(wi-?fi|wireless|internet|network)\b/i,
];

export function classifyCredentialQuestion(text: string): CredentialKind | null {
  const t = (text ?? '').slice(0, 1000);
  if (DOOR_PATTERNS.some((re) => re.test(t))) return 'door_code';
  if (WIFI_PATTERNS.some((re) => re.test(t))) return 'wifi_password';
  return null;
}

/** Guest-facing reply in the guest's chosen language (English when unknown or automatic). */
export function doorCodeEscalationReply(language?: string | null): string {
  return partyT(language)('doorCodeReply');
}

/** Context for the host-facing escalation. Door questions are urgent when the guest may be locked out. */
export function doorCodeEscalationQuestion(guestText: string): { question: string; urgent: boolean } {
  const urgent = /\b(locked out|can[’']?t get in|cannot get in|outside|at the door)\b/i.test(guestText);
  return { question: `Guest is asking for entry access: "${guestText.slice(0, 300)}"`, urgent };
}
