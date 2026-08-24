import 'server-only';

import { z } from 'zod';
import { serverEnv } from '@/lib/env';
import { redactPII } from '@/lib/ai/redaction';
import { log } from '@/lib/log';

const ALLOWED_CATEGORIES = new Set([
  'core',
  'appliances',
  'house_rules',
  'checkin_checkout',
  'local_recommendations',
  'emergency',
  'documents',
  'product_urls',
  'host_qa',
  'internal_notes',
  'transportation',
]);

const normalizedSchema = z.object({
  question: z.string().trim().min(8).max(500),
  answer: z.string().trim().min(10).max(4000),
  category: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().trim().max(1000).optional(),
});

export type GuestAnswerLearningInput = {
  question: string;
  hostAnswer: string;
  threadMessages: Array<{
    role: string;
    content: string;
    createdAt?: string | null;
  }>;
};

export type NormalizedGuestAnswer = {
  question: string;
  answer: string;
  category: string;
  confidence: number;
  rationale: string | null;
  model: string;
};

function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model did not return JSON.');
  return JSON.parse(content.slice(start, end + 1));
}

function normalizeCategory(category: string | undefined): string {
  const normalized = (category ?? '').trim();
  return ALLOWED_CATEGORIES.has(normalized) ? normalized : 'host_qa';
}

// Primary: a strong OpenAI model (owner directive 2026-08-24 — "use a powerful
// OpenAI model, otherwise fall back to OpenRouter"). AI_BRAIN_LEARNING_MODEL
// overrides the primary. The fallback leg is the configured extraction tier,
// which rides the OpenRouter route when AI_BASE_URL points at the router (the
// default), so a provider outage never silently drops a learning opportunity.
const PRIMARY_MODEL = process.env.AI_BRAIN_LEARNING_MODEL ?? 'openai/gpt-4.1';

const SYSTEM_PROMPT = [
  'You normalize host-guest conversations into reusable property knowledge for a short-term rental AI concierge.',
  'Return only JSON with keys: question, answer, category, confidence, rationale.',
  'Question: a generic guest question that would trigger this answer later.',
  'Answer: concise, guest-safe, specific enough to be useful, and written as property guidance.',
  'Use the host answer as the source of truth; use thread messages only for context.',
  'Never include Wi-Fi passwords, door codes, phone numbers, email addresses, full names, or other secrets.',
  'If the thread is too specific to one guest or stay, generalize it.',
  'If it is not reusable knowledge, still return JSON but set confidence below 0.5 and explain in rationale.',
].join(' ');

async function callLearningModel(model: string, payload: unknown): Promise<string> {
  const response = await fetch(`${serverEnv.aiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serverEnv.aiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Model request failed (HTTP ${response.status}).`);
  }
  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Model returned an empty response.');
  return content;
}

/**
 * Dedicated high-reliability model path for turning a host reply + attached
 * escalation thread into a proposed guest-safe Q/A. This intentionally does not
 * use the lightweight concierge default. Set AI_BRAIN_LEARNING_MODEL to override
 * the production model.
 */
export async function normalizeGuestAnswerForBrain(input: GuestAnswerLearningInput): Promise<NormalizedGuestAnswer> {
  if (!serverEnv.aiApiKey) throw new Error('AI provider is not configured.');

  const thread = input.threadMessages.slice(-60).map((message) => ({
    role: message.role,
    content: redactPII(message.content),
    createdAt: message.createdAt ?? null,
  }));
  const payload = {
    escalationQuestion: redactPII(input.question),
    hostReply: redactPII(input.hostAnswer),
    attachedThread: thread,
  };

  let content: string;
  let model = PRIMARY_MODEL;
  try {
    content = await callLearningModel(PRIMARY_MODEL, payload);
  } catch (primaryError) {
    model = serverEnv.openrouterModelExtraction || 'openai/gpt-4o';
    log.warn('guest_answer_learning_primary_failed', { model: PRIMARY_MODEL, error: String(primaryError) });
    content = await callLearningModel(model, payload);
  }

  const parsed = normalizedSchema.parse(extractJson(content));
  return {
    question: parsed.question,
    answer: parsed.answer,
    category: normalizeCategory(parsed.category),
    confidence: parsed.confidence ?? 0.85,
    rationale: parsed.rationale ?? null,
    model,
  };
}
