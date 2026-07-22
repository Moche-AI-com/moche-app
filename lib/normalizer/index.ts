import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { ChatMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { getAIProvider, assertEmbedDim } from '@/lib/ai';
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

// Extract a validated structured node from free-text host content.
// One initial attempt (temperature 0) plus a single higher-effort retry. Returns
// null on any failure — the caller must treat null as "skip", never as an error.
export async function normalizeToNode(
  input: { nodeType: NodeType; title: string; body: string },
  generate: GenerateFn = routedCompletion,
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
      log.warn('normalizer_generate_failed', { nodeType: input.nodeType, error: String(e) });
      return null;
    }
    const parsed = extractJsonObject(result.text);
    if (parsed == null) return null;
    const validated = schema.safeParse(parsed);
    if (!validated.success) return null;
    const data = validated.data as Record<string, unknown>;
    const content = renderContent(input.nodeType, data);
    if (!content.trim()) return null;
    return { nodeType: input.nodeType, title: input.title.slice(0, 200), data, content };
  };

  const first = await attempt();
  if (first) return first;
  // Single high-tier retry with a stricter reminder to emit valid JSON only.
  return attempt('Reminder: respond with ONLY a single valid JSON object using the exact keys. No explanation.');
}

// Best-effort UPSERT of a normalized node for a saved brain item. NON-BLOCKING and
// NON-THROWING: any failure (detection miss, normalizer null, embed/db error) is
// logged and swallowed so it can never break the normal ingest/reindex path.
export async function upsertNormalizedNode(
  admin: Admin,
  input: { propertyId: string; brainItemId: string | null; category: BrainCategory; title: string; body: string },
): Promise<void> {
  try {
    const nodeType = detectNodeType(input.category, input.title, input.body);
    if (!nodeType) return;

    const node = await normalizeToNode({ nodeType, title: input.title, body: input.body });
    if (!node) {
      log.info('normalizer_no_node', { propertyId: input.propertyId, nodeType });
      return;
    }

    const provider = getAIProvider();
    const [embedding] = await provider.embed([node.content]);
    assertEmbedDim(embedding.length);

    const { error } = await admin
      .from('property_knowledge_nodes')
      .upsert(
        {
          property_id: input.propertyId,
          node_type: node.nodeType,
          title: node.title,
          data: node.data as never,
          content: node.content,
          embedding: JSON.stringify(embedding),
          source_brain_item_id: input.brainItemId,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'property_id,node_type,title' },
      );
    if (error) {
      log.warn('knowledge_node_upsert_failed', { propertyId: input.propertyId, nodeType, error: error.message });
      return;
    }
    log.info('knowledge_node_upserted', { propertyId: input.propertyId, nodeType });
  } catch (e) {
    log.warn('knowledge_node_upsert_threw', { propertyId: input.propertyId, error: String(e) });
  }
}
