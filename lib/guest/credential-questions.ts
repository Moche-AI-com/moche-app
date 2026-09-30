// Credential policy: Moche-AI never stores or recites Wi-Fi passwords or door
// codes. A Wi-Fi password question gets host-written guidance on where to look
// inside the home; a door or entry code question is escalated to the host, who
// answers the guest directly in Host Chat.
//
// Pure and deterministic so the chat route can run it BEFORE retrieval or any
// model call: the answer never depends on what the model decides to say.

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

/** locationHint is host-authored, e.g. 'on the welcome card on the fridge'. Never the password itself. */
export function wifiGuidanceReply(locationHint?: string | null): string {
  const hint = locationHint?.trim();
  if (hint) return `For your security, the Wi-Fi password isn’t shared in chat. You’ll find it ${hint}.`;
  return 'For your security, the Wi-Fi password isn’t shared in chat. Check the label on the router or the welcome card in the home. If you still can’t find it, tap Contact host.';
}

export function doorCodeEscalationReply(): string {
  return 'For your security, entry codes aren’t shared in chat. I’ve let your host know, and they’ll reply to you here shortly.';
}

/** Escalation text the host sees. Door questions are urgent when the guest is locked out. */
export function doorCodeEscalationQuestion(guestText: string): { question: string; urgent: boolean } {
  const urgent = /\b(locked out|can[’']?t get in|cannot get in|outside|at the door)\b/i.test(guestText);
  return { question: `Guest is asking for entry access: "${guestText.slice(0, 300)}"`, urgent };
}
