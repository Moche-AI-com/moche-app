// Behavioral escalation triggers (roadmap correction 2026-09, issue #133).
//
// Deliberately NOT a sentiment classifier. Short guest messages are noisy —
// sarcasm, brevity, and non-native English all read as "angry", and false pings
// train hosts to ignore pings, which destroys the reliability promise. These
// triggers use observable behavior instead: the guest explicitly asked for a
// human, or re-asked substantially the same question after the concierge
// already answered. Both are deterministic, cheap, and explainable to the host.

import type { ChatMessage } from '@/lib/ai';

export type BehavioralTrigger = 'human_request' | 'repeat_question';

export interface BehavioralEscalation {
  escalate: boolean;
  trigger: BehavioralTrigger | null;
}

const HUMAN_NOUN_EN = '(?:human|person|someone|host|owner|manager|staff|agent)';

// "Get me to a person" across the portal's shipped languages. Patterns anchor on
// an intent verb near a human noun so neutral mentions ("the host manual is in
// the drawer") never fire. Standalone phrase patterns cover the verbless forms
// ("real person?").
const HUMAN_PATTERNS: RegExp[] = [
  // English — intent verb within a short window of a human noun.
  new RegExp(`\b(?:talk|speak|chat|message|text|call|reach|contact)\b[^.!?\n]{0,40}\b${HUMAN_NOUN_EN}\b`, 'i'),
  /\b(?:someone|anyone)\s+(?:i|we)\s+can\s+(?:call|contact|reach|speak to|talk to)\b/i,
  /\b(?:get|give)\s+me\s+(?:a\s+|the\s+)?(?:real\s+)?(?:human|person|host|manager)\b/i,
  /\b(?:real|actual|live)\s+(?:person|human)\b/i,
  /\bhuman\s+(?:agent|support|help)\b/i,
  // Spanish
  /\b(?:hablar|comunicarme|contactar|llamar)\b[^.!?\n]{0,40}\b(?:persona|humano|anfitri[oó]n|encargado|dueño)\b/i,
  /\b(?:una|un)\s+(?:persona\s+real|humano)\b/i,
  // French
  /\b(?:parler|contacter|joindre|appeler)\b[^.!?\n]{0,40}\b(?:humain|personne|hôte|propriétaire|responsable)\b/i,
  /\bvraie\s+personne\b/i,
  // German — both verb→noun and the verb-final word order.
  /\b(?:sprechen|kontaktieren|erreichen|anrufen)\b[^.!?\n]{0,40}\b(?:mensch(?:en)?|person|gastgeber|vermieter|mitarbeiter)\b/i,
  /\b(?:gastgeber|vermieter|mitarbeiter|mensch(?:en)?|person)\b[^.!?\n]{0,40}\b(?:sprechen|kontaktieren|erreichen|anrufen)\b/i,
  /\b(?:echte[rn]?|wirkliche[rn]?)\s+(?:person|mensch)\b/i,
  // Portuguese
  /\b(?:falar|contatar|contactar|ligar)\b[^.!?\n]{0,40}\b(?:pessoa|humano|anfitri[aã]o|respons[aá]vel|dono)\b/i,
  /\bpessoa\s+(?:real|de\s+verdade)\b/i,
  // Italian
  /\b(?:parlare|contattare|chiamare)\b[^.!?\n]{0,40}\b(?:persona|umano|host|proprietario|responsabile)\b/i,
  /\bpersona\s+(?:vera|reale)\b/i,
  // Dutch
  /\b(?:spreken|contact(?:eren)?|bellen)\b[^.!?\n]{0,40}\b(?:mens|persoon|host|eigenaar|medewerker)\b/i,
  /\becht[e]?\s+(?:persoon|mens)\b/i,
];

/** True when the guest explicitly asks to reach a human. */
export function detectHumanRequest(text: string): boolean {
  return HUMAN_PATTERNS.some((pattern) => pattern.test(text));
}

// Small English stopword list; content words survive in any language. Repeat
// detection across languages is intentionally conservative — a cross-language
// re-ask simply won't trigger, which fails safe (no ping) rather than crying wolf.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'whats', 'how', 'do',
  'does', 'did', 'can', 'could', 'i', 'we', 'you', 'it', 'this', 'that',
  'there', 'where', 'when', 'which', 'please', 'me', 'my', 'to', 'of', 'in',
  'on', 'for', 'and', 'or', 'at', 'be', 'with', 'about', 'again', 'so',
]);

function contentTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // The single highest-volume STR question: unify wi-fi/wifi/WiFi.
    .replace(/wi[\s-]?fi/g, 'wifi')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  return new Set(tokens);
}

/** Jaccard similarity over content-word sets. 0 when either side is empty. */
export function questionSimilarity(a: string, b: string): number {
  const tokensA = contentTokens(a);
  const tokensB = contentTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) if (tokensB.has(token)) overlap++;
  return overlap / (tokensA.size + tokensB.size - overlap);
}

/** A re-ask needs enough content words to be a real question… */
export const REPEAT_MIN_TOKENS = 3;
/** …and high overlap, so "wifi password?" and "wifi not working" never collide. */
export const REPEAT_SIMILARITY_THRESHOLD = 0.6;

/** True when the current question substantially repeats an earlier guest turn. */
export function detectRepeatQuestion(question: string, priorGuestTurns: string[]): boolean {
  if (contentTokens(question).size < REPEAT_MIN_TOKENS) return false;
  return priorGuestTurns.some(
    (turn) =>
      contentTokens(turn).size >= REPEAT_MIN_TOKENS &&
      questionSimilarity(question, turn) >= REPEAT_SIMILARITY_THRESHOLD,
  );
}

/**
 * Evaluate the behavioral triggers for one guest turn. `history` must contain
 * only PRIOR turns (the current question is evaluated against them). Human
 * requests win over repeat detection — the host ping says why either way.
 */
export function behavioralEscalation(question: string, history: ChatMessage[]): BehavioralEscalation {
  if (detectHumanRequest(question)) return { escalate: true, trigger: 'human_request' };
  const priorGuestTurns = history.filter((m) => m.role === 'user').map((m) => m.content);
  if (detectRepeatQuestion(question, priorGuestTurns)) return { escalate: true, trigger: 'repeat_question' };
  return { escalate: false, trigger: null };
}
