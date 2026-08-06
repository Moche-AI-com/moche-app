import { describe, it, expect } from 'vitest';
import {
  SECTION_GAP_MS,
  deriveSectionTitle,
  fallbackTitle,
  sectionizeHistory,
  sectionPreview,
  type HistoryMessage,
} from './history';

const at = (iso: string, role: HistoryMessage['role'], content: string): HistoryMessage => ({
  role,
  content,
  created_at: iso,
});

describe('deriveSectionTitle', () => {
  it('turns a guest question into a sentence-cased heading', () => {
    expect(deriveSectionTitle('where can we eat nearby?')).toBe('Where can we eat nearby');
  });

  it('strips leading filler', () => {
    const title = deriveSectionTitle('Hi, can you tell me where the beach towels are?');
    expect(title).not.toMatch(/^Hi/);
    expect(title?.toLowerCase()).toContain('beach towels');
  });

  it('keeps only the first sentence', () => {
    expect(deriveSectionTitle('Where is the pool? We arrive late tonight.')).toBe('Where is the pool');
  });

  it('preserves acronyms and proper nouns after the first character', () => {
    expect(deriveSectionTitle('what is the WiFi password')).toBe('What is the WiFi password');
  });

  it('returns null for greetings and other non-descriptive openers', () => {
    expect(deriveSectionTitle('Hi')).toBeNull();
    expect(deriveSectionTitle('hello!')).toBeNull();
    expect(deriveSectionTitle('   ')).toBeNull();
    expect(deriveSectionTitle('')).toBeNull();
  });

  it('truncates long questions on a word boundary with an ellipsis', () => {
    const long = 'Could you please tell me the very best places to watch the sunset anywhere on this island';
    const title = deriveSectionTitle(long)!;
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThan(long.length);
    expect(title).not.toMatch(/\s…$/);
  });
});

describe('fallbackTitle', () => {
  it('formats a readable date heading', () => {
    expect(fallbackTitle('2026-08-06T12:00:00.000Z', 'en-US')).toMatch(/Aug/);
  });

  it('degrades gracefully on an unparseable timestamp', () => {
    expect(fallbackTitle('not-a-date')).toBe('Earlier conversation');
  });
});

describe('sectionizeHistory', () => {
  it('returns nothing for an empty history', () => {
    expect(sectionizeHistory([])).toEqual([]);
  });

  it('keeps a tight back-and-forth in one section', () => {
    const base = Date.parse('2026-08-06T12:00:00.000Z');
    const out = sectionizeHistory([
      at(new Date(base).toISOString(), 'guest', 'Where can we eat nearby?'),
      at(new Date(base + 60_000).toISOString(), 'assistant', 'Two good options are…'),
      at(new Date(base + 120_000).toISOString(), 'guest', 'Do they take walk-ins?'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].messages).toHaveLength(3);
    expect(out[0].title).toBe('Where can we eat nearby');
  });

  it('splits on a long quiet gap', () => {
    const base = Date.parse('2026-08-06T09:00:00.000Z');
    const out = sectionizeHistory([
      at(new Date(base).toISOString(), 'guest', 'Where can we eat nearby?'),
      at(new Date(base + SECTION_GAP_MS + 1000).toISOString(), 'guest', 'How do we work the coffee machine?'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].title).toBe('How do we work the coffee machine');
  });

  it('does not split on a gap shorter than the threshold', () => {
    const base = Date.parse('2026-08-06T09:00:00.000Z');
    const out = sectionizeHistory([
      at(new Date(base).toISOString(), 'guest', 'Where can we eat nearby?'),
      at(new Date(base + SECTION_GAP_MS - 1000).toISOString(), 'guest', 'And for breakfast?'),
    ]);
    expect(out).toHaveLength(1);
  });

  it('starts a new section on a new calendar day even without a long gap', () => {
    const out = sectionizeHistory([
      at('2026-08-06T23:50:00.000Z', 'guest', 'Where can we eat nearby?'),
      at('2026-08-07T00:05:00.000Z', 'guest', 'Is the pool open early?'),
    ]);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to a dated heading when no guest message is descriptive', () => {
    const out = sectionizeHistory([
      at('2026-08-06T12:00:00.000Z', 'guest', 'Hi'),
      at('2026-08-06T12:01:00.000Z', 'assistant', 'Hello — how can I help?'),
    ], 'en-US');
    expect(out[0].title).toMatch(/Aug/);
  });

  it('titles a section from the first GUEST message, not the assistant', () => {
    const out = sectionizeHistory([
      at('2026-08-06T12:00:00.000Z', 'assistant', 'Welcome to the villa!'),
      at('2026-08-06T12:01:00.000Z', 'guest', 'Where are the beach chairs?'),
    ]);
    expect(out[0].title).toBe('Where are the beach chairs');
  });

  it('gives every section a distinct id', () => {
    const base = Date.parse('2026-08-06T09:00:00.000Z');
    const out = sectionizeHistory([
      at(new Date(base).toISOString(), 'guest', 'Where can we eat nearby?'),
      at(new Date(base + SECTION_GAP_MS + 1).toISOString(), 'guest', 'Any good bars?'),
      at(new Date(base + 2 * SECTION_GAP_MS + 2).toISOString(), 'guest', 'How do we get a taxi?'),
    ]);
    expect(new Set(out.map((s) => s.id)).size).toBe(out.length);
  });

  it('tolerates a bad timestamp without losing messages', () => {
    const out = sectionizeHistory([
      at('2026-08-06T12:00:00.000Z', 'guest', 'Where can we eat nearby?'),
      at('nonsense', 'assistant', 'Two good options are…'),
      at('2026-08-06T12:05:00.000Z', 'guest', 'Thanks!'),
    ]);
    const total = out.reduce((n, s) => n + s.messages.length, 0);
    expect(total).toBe(3);
  });
});

describe('sectionPreview', () => {
  const section = sectionizeHistory([
    at('2026-08-06T12:00:00.000Z', 'guest', 'Where can we eat nearby?'),
    at('2026-08-06T12:01:00.000Z', 'assistant', 'Two good options are Cala and Mar.'),
  ])[0];

  it('names the speaker of the last message', () => {
    expect(sectionPreview(section)).toBe('Concierge: Two good options are Cala and Mar.');
  });

  it('labels a host reply distinctly from the concierge', () => {
    const hosted = sectionizeHistory([
      at('2026-08-06T12:00:00.000Z', 'guest', 'Where are the spare keys?'),
      at('2026-08-06T12:01:00.000Z', 'host', 'In the blue drawer.'),
    ])[0];
    expect(sectionPreview(hosted)).toBe('Your host: In the blue drawer.');
  });

  it('truncates to the requested length', () => {
    const preview = sectionPreview(section, 20);
    expect(preview.length).toBeLessThanOrEqual(20);
    expect(preview.endsWith('…')).toBe(true);
  });
});
