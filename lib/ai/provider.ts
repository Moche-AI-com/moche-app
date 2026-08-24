import 'server-only';
import type { Database } from '@/lib/database.types';

export type IntentType = Database['public']['Enums']['intent_type'];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Multimodal content parts (OpenAI/OpenRouter chat-completions shape). Used by the
// onboarding extraction pass to send listing photos to a vision-capable model.
export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type MessageContent = string | MessageContentPart[];

// Wider message shape for vision-capable calls. `ChatMessage` is assignable to
// `AIMessage`, so existing string-content callers (concierge, classification, …)
// type-check unchanged; only callers that attach images need the wider shape.
export type AIMessage = Omit<ChatMessage, 'content'> & { content: MessageContent };

/** Flatten message content to plain text (image parts contribute nothing). */
export function messageContentText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is Extract<MessageContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  usage?: TokenUsage;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  totalTokens: number;
}

export const EMBED_DIM = 1536;

// Provider abstraction. Domain/UI never depends on a concrete provider.
export interface AIProvider {
  readonly name: string;
  readonly chatModel: string;
  readonly embedModel: string;
  embed(texts: string[]): Promise<number[][]>;
  // Optional: same as embed() but also returns the model + token usage for cost logging.
  // Providers that don't implement it fall back to embed() with zero token accounting.
  embedWithUsage?(texts: string[]): Promise<EmbedResult>;
  generate(messages: AIMessage[], opts?: GenerateOptions): Promise<GenerateResult>;
  classifyIntent(text: string): Promise<IntentType>;
}
