import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { ChatMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { routedCompletion } from '@/lib/router/modelRouter';
import { log } from '@/lib/log';
import { type NodeType, schemaFor, renderContent } from './schemas';
import { buildNormalizerPrompt } from './prompts';

export { NODE_TYPES } from './schemas';
export type { NodeType } from './schemas';

type Admin = SupabaseClient<Database>;
type BrainCategory = Database['public']['Enums']['brain_category'];

export interface NormalizedNode {
  nodeType: NodeType;
  title: string;
  data: Record<string, unknown>;
  content: string;
}

// Which node type (if any) a saved brain item maps to. POC mapping:
//   core            → wifi
//   checkin_checkout → checkin | checkout
// Anything else is out of scope and returns null (no normalization attempted).
export function detectNodeType(category: BrainCategory, title: string, body: string): NodeType | null {
  const text = `${title}\n${body}`.toLowerCase();
  const hasWifi = /\b(wi[\s-]?fi|wireless|internet|network|ssid|hotspot)\b/.test(text);
  const hasCheckout = /\b(check[\s-]?out|checkout|departure|when you leave|day of departure)\b/.test(text);
  const hasCheckin = /\b(check[\s-]?in|checkin|arrival|when you arrive|getting in|lockbox|key ?box|entry code|access code)\b/.test(text);

  if (category === 'core') {
    return hasWifi ? 'wifi' : null;
  }
  if (category === 'checkin_checkout') {
    if (hasCheckout && !hasCheckin) return 'checkout';
    if (hasCheckin && !hasCheckout) return 'checkin';
    if (hasCheckout) return 'checkout';
    if (hasCheckin) return 'checkin';
    return null;
  }
  return null;
}

// Best-effort: strip code fences and pull the first {...} block out of an LLM reply.
function extractJsonObject(raw: string): unknown | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

type GenerateFn = (messages: ChatMessage[], opts?: GenerateOptions) => Promise<GenerateResult>;

// Normalization produces a draft, never canonical publication. It declares the
// strong brain_ops tier with no silent downgrade.
const brainOpsCompletion: GenerateFn = (messages, opts) =>
  routedCompletion(messages, opts, { task: 'brain_ops' });

// Extract a validated structured node from free-text host content.
// One initial attempt (temperature 0) plus a single higher-effort retry. Returns
// null on any failure — the caller must treat null as "skip", never as an error.
export async function normalizeToNode(
  input: { nodeType: NodeType; title: string; body: string },
  generate: GenerateFn = brainOpsCompletion,
): Promise<NormalizedNode | null> {
  const source = `${input.title}\n\n${input.body}`.trim();
  if (!source) return null;
  const schema = schemaFor[input.nodeType];
  const system = buildNormalizerPrompt(input.nodeType);

  const attempt = async (extraSystem?: string): Promise<NormalizedNode | null> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: extraSystem ? `${system}\n\n${extraSystem}` : system },
      { role: 'user', content: source },
    ];
    let result: GenerateResult;
    try {
      result = await generate(messages, { temperature: 0, maxTokens: 500 });
    } catch (e) {
      log.warn('normalizer_generate_failed', { nodeType: input.nodeType, code: 'completion_unavailable' });
      return null;
    }
    const parsed = extractJsonObject(result.text);
    if (parsed == null) return null;
    const validated = schema.safeParse(parsed);
    if (!validated.success) return null;
    const data = validated.data as Record<string, unknown>;
    if (input.nodeType === 'wifi' && typeof data.password_location === 'string') {
      const canonical = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!canonical(source).includes(canonical(data.password_location))) return null;
    }
    const content = renderContent(input.nodeType, data);
    if (!content.trim()) return null;
    return { nodeType: input.nodeType, title: input.title.slice(0, 200), data, content };
  };

  const first = await attempt();
  if (first) return first;
  // Single high-tier retry with a stricter reminder to emit valid JSON only.
  return attempt('Reminder: respond with ONLY a single valid JSON object using the exact keys. No explanation.');
}

// Compatibility boundary for old callers. This table has no approval/visibility/
// lifecycle contract, so publishing generated text here would bypass human review.
// Keep approved source chunks; explicit proposals must precede any future derivative
// publication. Existing graph rows are also excluded by the guest reader.
export async function upsertNormalizedNode(
  admin: Admin,
  input: { propertyId: string; brainItemId: string | null; category: BrainCategory; title: string; body: string },
): Promise<void> {
  void admin;
  void input;
}
