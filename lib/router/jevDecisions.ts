import 'server-only';
import { serverEnv } from '@/lib/env';
import { containsLikelyPII, redactPII } from '@/lib/ai/redaction';

const JEV_MODEL = 'typesafe/jev-1.13';
const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

export interface ChoiceRequest {
  state: Record<string, string>;
  instructions: string;
  criteria: Record<string, string>;
}

export interface ChoiceDecision {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
}

// Opt-in primitive only: existing chat, guest escalation and Brain routes do not call this.
export async function decideChoice(request: ChoiceRequest): Promise<ChoiceDecision> {
  if (!serverEnv.openrouterApiKey) throw new Error('Jev is not configured.');
  const entries = Object.entries(request.criteria);
  if (entries.length < 2 || entries.length > 12 ||
      entries.some(([key, value]) => !/^[a-z][a-z0-9_]{0,39}$/.test(key) || !value.trim())) {
    throw new Error('Invalid Jev choice criteria.');
  }
  if (!request.instructions.trim() || request.instructions.length > 1000) {
    throw new Error('Invalid Jev instructions.');
  }
  const stateEntries = Object.entries(request.state);
  if (!stateEntries.length || stateEntries.length > 8 ||
      stateEntries.some(([key, value]) => !/^[a-z][a-z0-9_]{0,39}$/.test(key) || typeof value !== 'string' || value.length > 4000)) {
    throw new Error('Invalid Jev state.');
  }
  // All caller-supplied fields must pass the same outbound privacy gate.
  const state = Object.fromEntries(stateEntries.map(([key, value]) => [key, redactPII(value)]));
  const instructions = redactPII(request.instructions);
  const criteria = Object.fromEntries(entries.map(([key, value]) => [key, redactPII(value)]));
  if ([...Object.values(state), instructions, ...Object.values(criteria)].some(containsLikelyPII)) {
    throw new Error('Jev input contains residual PII.');
  }
  const res = await fetch(DECISIONS_URL, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${serverEnv.openrouterApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: JEV_MODEL, state,
      questions: { label: { type: 'choice', instructions, criteria } },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Jev decision failed: ${res.status}`);
  const payload: unknown = await res.json();
  if (!payload || typeof payload !== 'object') throw new Error('Malformed Jev response.');
  const data = payload as Record<string, unknown>;
  const answers = data.answers as Record<string, unknown> | undefined;
  const answer = answers?.label as Record<string, unknown> | undefined;
  const probabilities = answer?.probabilities as Record<string, unknown> | undefined;
  if (answer?.type !== 'choice' || typeof answer.choice !== 'string' ||
      !Object.hasOwn(request.criteria, answer.choice) ||
      typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 || answer.confidence > 1 ||
      !probabilities || typeof probabilities !== 'object' ||
      entries.some(([key]) => typeof probabilities[key] !== 'number' ||
        !Number.isFinite(probabilities[key]) || (probabilities[key] as number) < 0 || (probabilities[key] as number) > 1) ||
      typeof data.model !== 'string' || !data.model.startsWith(JEV_MODEL)) {
    throw new Error('Malformed Jev response.');
  }
  return {
    choice: answer.choice, confidence: answer.confidence,
    probabilities: Object.fromEntries(entries.map(([key]) => [key, probabilities[key] as number])),
    model: data.model,
  };
}
