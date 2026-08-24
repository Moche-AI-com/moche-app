import 'server-only';
import { createHash } from 'node:crypto';
import type { AIProvider, AIMessage, GenerateOptions, GenerateResult, IntentType } from './provider';
import { EMBED_DIM, messageContentText } from './provider';

// Deterministic, offline dev-fallback provider.
// - Embeddings: hashed pseudo-random vectors seeded by token content, so identical
//   text always maps to the same vector and similar text shares dimensions. This is
//   NOT semantically meaningful but is stable and testable.
// - generate(): a templated answer grounded ONLY in the provided context block.
// - classifyIntent(): keyword heuristics.
//
// This exists so RAG + ingestion work end-to-end without any external API key.
// It must never be presented to end users as production-quality AI.

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function seededUnit(seed: string): number {
  const h = createHash('sha256').update(seed).digest();
  // Use first 4 bytes as uint32 -> [0,1)
  const n = h.readUInt32BE(0) / 0xffffffff;
  return n;
}

export function fallbackEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    vec[0] = 1;
    return vec;
  }
  for (const tok of tokens) {
    // Each token contributes to a few deterministic dimensions.
    for (let k = 0; k < 3; k++) {
      const idx = Math.floor(seededUnit(`${tok}:${k}`) * EMBED_DIM) % EMBED_DIM;
      const sign = seededUnit(`${tok}:sign:${k}`) > 0.5 ? 1 : -1;
      vec[idx] += sign * (1 + seededUnit(`${tok}:mag:${k}`));
    }
  }
  // L2 normalize so cosine similarity is well-defined.
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

const INTENT_KEYWORDS: Array<[IntentType, RegExp]> = [
  ['emergency', /\b(fire|smoke|gas leak|emergency|ambulance|911|bleeding|carbon monoxide|break ?in|intrud)/i],
  ['safety', /\b(unsafe|danger|lock.?out|locked out|can't get in|security|alarm)/i],
  ['maintenance', /\b(broken|not working|leak|clogged|won't turn|no hot water|malfunction|repair|flood)/i],
  ['cleaning', /\b(dirty|clean|towels?|trash|garbage|sheets|linens|stain)/i],
  ['wifi', /\b(wifi|wi-fi|internet|network|password|router)/i],
  ['checkin', /\b(check.?in|arrive|arrival|get in|entry|door code|lockbox)/i],
  ['checkout', /\b(check.?out|leave|departure|leaving|late checkout)/i],
  ['parking', /\b(park|parking|garage|driveway|car)/i],
  ['appliance', /\b(oven|stove|microwave|dishwasher|washer|dryer|thermostat|tv|remote|coffee|espresso|heat|ac|air condition)/i],
  ['house_rules', /\b(rule|smok|pet|noise|quiet|party|guest limit|allowed)/i],
  ['local', /\b(recommend|restaurant|nearby|coffee shop|things to do|beach|grocery|store|attraction)/i],
];

export function fallbackClassifyIntent(text: string): IntentType {
  for (const [intent, re] of INTENT_KEYWORDS) {
    if (re.test(text)) return intent;
  }
  return 'information';
}

function extractContextBlock(messages: AIMessage[]): string {
  // The system prompt embeds retrieved chunks in a delimited block. Multimodal
  // content is flattened to its text parts first — image parts carry no context.
  const sys = messages.find((m) => m.role === 'system');
  const text = sys ? messageContentText(sys.content) : '';
  const match = text.match(/<untrusted_context>([\s\S]*?)<\/untrusted_context>/);
  return match ? match[1].trim() : '';
}

export const fallbackProvider: AIProvider = {
  name: 'dev-fallback',
  chatModel: 'dev-fallback-chat',
  embedModel: 'dev-fallback-embed',

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(fallbackEmbed);
  },

  async generate(messages: AIMessage[], _opts?: GenerateOptions): Promise<GenerateResult> {
    const questionMessage = [...messages].reverse().find((m) => m.role === 'user');
    const question = questionMessage ? messageContentText(questionMessage.content) : '';
    const context = extractContextBlock(messages);
    if (!context) {
      return {
        text:
          "I don't have information about that in this property's guide yet. I've let the host know so they can help you directly.",
        model: this.chatModel,
      };
    }
    // Grounded template: surface the most relevant context lines.
    const qTokens = new Set(tokenize(question));
    const lines = context
      .split(/\n+/)
      .map((l) => l.replace(/^\[[^\]]*\]\s*/, '').trim())
      .filter(Boolean);
    const scored = lines
      .map((line) => {
        const overlap = tokenize(line).filter((t) => qTokens.has(t)).length;
        return { line, overlap };
      })
      .sort((a, b) => b.overlap - a.overlap);
    const best = scored.filter((s) => s.overlap > 0).slice(0, 3).map((s) => s.line);
    const body = best.length > 0 ? best.join(' ') : lines.slice(0, 2).join(' ');
    return {
      text: `${body}`.slice(0, 1200),
      model: this.chatModel,
    };
  },

  async classifyIntent(text: string): Promise<IntentType> {
    return fallbackClassifyIntent(text);
  },
};
