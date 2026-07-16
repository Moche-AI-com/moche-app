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

export interface GenerateResult {
  text: string;
  model: string;
}

export const EMBED_DIM = 1536;

// Provider abstraction. Domain/UI never depends on a concrete provider.
export interface AIProvider {
  readonly name: string;
  readonly chatModel: string;
  readonly embedModel: string;
  embed(texts: string[]): Promise<number[][]>;
  generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult>;
  classifyIntent(text: string): Promise<IntentType>;
}
