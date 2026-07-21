import 'server-only';
import type { Database } from '@/lib/database.types';

export type IntentType = Database['public']['Enums']['intent_type'];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult>;
  classifyIntent(text: string): Promise<IntentType>;
}
