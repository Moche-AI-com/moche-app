import 'server-only';
import { z } from 'zod';
import { routedCompletion } from '@/lib/router/modelRouter';
import type { ChatMessage } from '@/lib/ai/provider';
import { log } from '@/lib/log';

// WS-7 — guest-initiated service request with AI-driven adaptive interview.
// This is a SEPARATE flow from lib/guest/maintenance.ts's passive chat-derived
// ticket creation. That flow stays untouched; this module powers the explicit
// "Report an issue" card in the guest portal.

// ---------------------------------------------------------------------------
// Safety triage — a cheap, deterministic, zero-latency gate that runs BEFORE
// any AI call. A single matched trigger bypasses the entire adaptive interview
// and escalates immediately, per spec. Intentionally conservative (a false
// positive just skips straight to escalation, which is always a safe outcome;
// a false negative simply falls through to the normal interview, which itself
// asks about water/power/gas involvement).
export const SAFETY_TRIGGERS: ReadonlyArray<{ flag: string; pattern: RegExp; guestMessage: string }> = [
  {
    flag: 'gas_smell',
    pattern: /\b(gas smell|smell(s|ing)? (like )?gas|rotten egg smell|natural gas leak|propane leak)\b/i,
    guestMessage:
      'If you smell gas, leave the unit right away. Do not flip light switches or use anything with a flame. Call your local gas emergency line once you are outside.',
  },
  {
    flag: 'electrical_sparking',
    pattern: /\b(spark(s|ing)?|arcing outlet|smoking outlet|burning smell (from|near) (the )?(outlet|wire|panel|breaker))\b/i,
    guestMessage: 'Please do not touch the outlet or panel. Stay away from the area — we are escalating this immediately.',
  },
  {
    flag: 'active_flooding',
    pattern: /\b(flood(ing)?|water (is )?(pouring|gushing|everywhere)|pipe burst|ceiling (is )?(leaking|collapsing))\b/i,
    guestMessage: 'If it is safe, move valuables away from the water and avoid standing water near outlets. We are escalating this immediately.',
  },
  {
    flag: 'no_heat_freezing',
    pattern: /\b(no heat|heat(er)? (is )?(out|broken|not working)|furnace (is )?(out|down|broken))\b/i,
    guestMessage: 'We are treating this as urgent given the cold. Extra blankets are in the unit if you need them in the meantime.',
  },
  {
    flag: 'no_ac_extreme_heat',
    pattern: /\b(no a\/?c|air ?condition(ing|er)? (is )?(out|broken|not working))\b/i,
    guestMessage: 'We are treating this as urgent given the heat. Fans and hydration in the meantime are your best bet.',
  },
  {
    flag: 'smoke_co_alarm',
    pattern: /\b(smoke (alarm|detector)|carbon monoxide|co alarm|co detector)\b/i,
    guestMessage:
      'If this is a carbon monoxide alarm, leave the unit and get fresh air right away, then call emergency services. If you see or smell smoke, evacuate first.',
  },
  {
    flag: 'lockout',
    pattern: /\b(locked out|can'?t get (in|inside)|lost (my |the )?key|key(s)? (broke|stuck|won'?t turn))\b/i,
    guestMessage: 'We are reaching out right away to get you back inside as quickly as possible.',
  },
  {
    flag: 'security_issue',
    pattern: /\b(break[- ]?in|intrud(er|ing)|someone (is |was )?(trying to get in|outside the door)|door (was )?forced)\b/i,
    guestMessage:
      'If you believe someone is on the property or trying to get in and you feel unsafe, call local emergency services first, then let us know once you are safe.',
  },
];

export interface SafetyTriageResult {
  flags: string[];
  guestMessage: string;
}

export function runSafetyTriage(text: string): SafetyTriageResult | null {
  const matched = SAFETY_TRIGGERS.filter((t) => t.pattern.test(text));
  if (matched.length === 0) return null;
  return {
    flags: matched.map((m) => m.flag),
    guestMessage: matched.map((m) => m.guestMessage).join(' '),
  };
}

// ---------------------------------------------------------------------------
// Adaptive interview — one question at a time, capped, structured final report.

export const INTERVIEW_MAX_QUESTIONS = 6;

const QuestionTurnSchema = z.object({
  type: z.literal('question'),
  question: z.string().trim().min(1).max(300),
  choices: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
});

// category/severity intentionally reuse the DB's service_type/urgency_level enum
// values verbatim so a valid report writes straight into service_requests with
// no translation layer.
export const FinalReportSchema = z.object({
  category: z.enum(['maintenance', 'cleaning', 'safety', 'emergency', 'other']),
  subcategory: z.string().trim().max(80).default(''),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  locationNote: z.string().trim().max(300).default(''),
  likelyCauses: z.array(z.string().trim().max(200)).max(5).default([]),
  suggestedParts: z.array(z.string().trim().max(120)).max(8).default([]),
  accessInstructions: z.string().trim().max(500).default(''),
  guestAvailability: z.string().trim().max(300).default(''),
  summary: z.string().trim().min(1).max(400),
});

const FinalTurnSchema = z.object({
  type: z.literal('final'),
  report: FinalReportSchema,
});

const InterviewTurnSchema = z.union([QuestionTurnSchema, FinalTurnSchema]);

export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;
export type FinalReport = z.infer<typeof FinalReportSchema>;

export interface InterviewEntry {
  role: 'guest' | 'assistant';
  text: string;
  choices?: string[];
}

const SYSTEM_PROMPT = `You help a short-term-rental guest describe a problem with their unit so the maintenance crew gets an actionable report. The guest is NOT a technician.

Rules:
- Never use diagnostic jargon. Never ask the guest to open panels, access wiring, shut off mains, test electrical components, or attempt any repair or troubleshooting step that could hurt them or make damage worse.
- Ask only questions that change what the crew needs to know: what and where, when it started, whether it is getting worse, whether water/power/gas is involved, whether the unit/area is still usable, whether a quick photo or short video is easy to share, and when the guest is comfortable having someone enter.
- Ask ONE question at a time. Prefer offering 2-5 short multiple-choice options over open-ended text. Accept vague answers gracefully -- never push back or ask the guest to be more precise.
- Ask at most ${INTERVIEW_MAX_QUESTIONS} questions total, and stop earlier the moment you have enough to write a useful report.
- When you have enough information (or have reached the question cap), respond with the final report instead of another question.

Respond with ONLY raw JSON, no markdown fences, no commentary, matching exactly one of these two shapes:

Question: {"type":"question","question":"...","choices":["...","..."]}
(choices is optional -- omit it for a question that genuinely needs free text, like "what happened")

Final report: {"type":"final","report":{"category":"maintenance|cleaning|safety|emergency|other","subcategory":"short label, e.g. kitchen sink leak","severity":"low|medium|high|critical","locationNote":"where in the unit","likelyCauses":["unverified guesses, plain language"],"suggestedParts":["plain-language parts/tools that might be needed, unverified"],"accessInstructions":"anything about pets, noise, entry preferences","guestAvailability":"when it's ok for someone to come by","summary":"one or two plain sentences a crew member reads first"}}

likelyCauses and suggestedParts are your best guesses only -- never state them as certain, and it is fine to leave either empty if you are not confident.`;

function buildFallbackFinal(initialDescription: string): FinalReport {
  return {
    category: 'other',
    subcategory: '',
    severity: 'medium',
    locationNote: '',
    likelyCauses: [],
    suggestedParts: [],
    accessInstructions: '',
    guestAvailability: '',
    summary: initialDescription.slice(0, 400),
  };
}

function parseInterviewTurn(raw: string, atCap: boolean, initialDescription: string): InterviewTurn {
  const cleaned = raw.trim().replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const json = JSON.parse(cleaned);
    const parsed = InterviewTurnSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to the deterministic fallback below
  }
  log.warn('service_request_interview_parse_failed', { rawLength: raw.length, atCap });
  if (atCap) return { type: 'final', report: buildFallbackFinal(initialDescription) };
  return { type: 'question', question: 'Could you tell me a bit more about what you noticed?' };
}

function transcriptToMessages(initialDescription: string, transcript: InterviewEntry[]): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Guest's initial report: ${initialDescription}` },
  ];
  for (const entry of transcript) {
    if (entry.role === 'assistant') {
      const suffix = entry.choices?.length ? ` (offered choices: ${entry.choices.join(', ')})` : '';
      messages.push({ role: 'assistant', content: `${entry.text}${suffix}` });
    } else {
      messages.push({ role: 'user', content: entry.text });
    }
  }
  return messages;
}

// Runs one turn of the interview. Never throws — any AI failure or malformed
// response degrades to a safe fallback (a generic follow-up question, or a
// minimal final report once the question cap is hit) so a guest is never stuck.
export async function runInterviewTurn(initialDescription: string, transcript: InterviewEntry[]): Promise<InterviewTurn> {
  const questionsAsked = transcript.filter((t) => t.role === 'assistant').length;
  const atCap = questionsAsked >= INTERVIEW_MAX_QUESTIONS;
  const messages = transcriptToMessages(initialDescription, transcript);
  if (atCap) {
    messages.push({
      role: 'system',
      content: 'You have reached the question cap. You MUST respond with the final report now, using your best judgment for anything still unclear.',
    });
  }

  try {
    // Guest-authored maintenance descriptions are treated the same as guest
    // chat content: the 'concierge' task tier stays in-house unless the host
    // has explicitly opted into external routing (see shouldRouteExternally).
    const result = await routedCompletion(messages, { temperature: 0.3, maxTokens: 500 }, { task: 'concierge' });
    return parseInterviewTurn(result.text, atCap, initialDescription);
  } catch (e) {
    log.warn('service_request_interview_completion_failed', { error: String(e), atCap });
    if (atCap) return { type: 'final', report: buildFallbackFinal(initialDescription) };
    return { type: 'question', question: 'Could you tell me a bit more about what you noticed?' };
  }
}
