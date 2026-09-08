import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { messagingDb, ids } from '@/test/helpers/messaging-db';

const mocks = vi.hoisted(() => ({ generate: vi.fn(), embed: vi.fn() }));
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({ embed: mocks.embed, embedModel: 'synthetic' }),
}));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: mocks.generate }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('@/lib/brain/cache', () => ({
  normalizeQuestion: (s: string) => s.toLowerCase().trim(),
  getBrainVersion: async () => 1,
  lookupCachedAnswer: async () => null,
  cacheAnswer: vi.fn(),
}));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Exercise the real concierge, canonical loader, ranking, prompt assembly and
// citation resolver. Only external AI/database boundaries are synthetic.
import { answerGuestQuestion } from './concierge';

const canonical = (overrides: Record<string, unknown> = {}) => ({
  id: ids.escalation, property_id: ids.property, status: 'approved',
  host_note: 'APPROVED_SYNTHETIC_NOTE', tags: [], intent_tags: [],
  is_favorite: false, distance_miles: 1,
  places: {
    name: 'Approved synthetic cafe', category: 'cafe', address: null,
    provider: 'manual', last_refreshed_at: '2026-09-01T00:00:00Z',
  },
  ...overrides,
});
const legacy = (overrides: Record<string, unknown> = {}) => ({
  id: ids.message, property_id: ids.property, name: 'Legacy synthetic cafe',
  category: 'cafe', host_preference: 'neutral', visibility: 'guest',
  approved: true, hidden: false, host_note: 'LEGACY_SYNTHETIC_NOTE',
  description: null, distance_note: null, priority_weight: 0, deleted_at: null,
  ...overrides,
});
const opts = {
  propertyId: ids.property, propertyName: 'Synthetic villa',
  question: 'Where can I get coffee?', history: [], persist: false,
};
function database(seed: Parameters<typeof messagingDb>[0], errorCode?: string) {
  const db = messagingDb(seed);
  const from = db.from;
  const client = {
    ...db, rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: (table: string) => {
      const query = from(table);
      if (table === 'property_place_recommendations' && errorCode) {
        query.then = (resolve: (value: unknown) => void) => Promise.resolve({
          data: null, error: { code: errorCode, message: 'Synthetic read failure' },
        }).then(resolve);
      }
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, reads: db.reads, writes: db.writes };
}
function prompt() {
  expect(mocks.generate).toHaveBeenCalledOnce();
  return JSON.stringify(mocks.generate.mock.calls[0][0]);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.embed.mockResolvedValue([[0.1]]);
  // Even an invented citation must resolve only against the current approved set.
  mocks.generate.mockResolvedValue({
    text: `Please ask your host.\nPLACES: ${ids.escalation} | ${ids.message}`,
    model: 'synthetic',
  });
});

describe('guest concierge local publication boundary', () => {
  it('LOCAL-1 excludes a suggested place and its draft host note from the actual AI prompt', async () => {
    const db = database({ property_place_recommendations: [canonical({
      status: 'suggested', host_note: 'INTERNAL_SYNTHETIC_DRAFT_NOTE',
      places: { ...canonical().places, name: 'Unapproved synthetic cafe' },
    })] });
    const result = await answerGuestQuestion(db.client, opts);
    expect(prompt()).not.toContain('INTERNAL_SYNTHETIC_DRAFT_NOTE');
    expect(prompt()).not.toContain('Unapproved synthetic cafe');
    expect(result.places).toEqual([]);
    expect(db.reads).not.toContain('recommendations');
    expect(db.reads).not.toContain('nearby_places');
  });

  it('LOCAL-2 keeps an all-hidden canonical set authoritative over retained legacy notes', async () => {
    const db = database({
      property_place_recommendations: [canonical({
        status: 'hidden', host_note: 'HIDDEN_CANONICAL_NOTE',
        places: { ...canonical().places, name: 'Hidden synthetic cafe' },
      })],
      recommendations: [legacy({
        name: 'Hidden synthetic cafe', host_note: 'LEGACY_HIDDEN_RESURRECTED_NOTE',
      })],
    });
    const result = await answerGuestQuestion(db.client, opts);
    expect(prompt()).not.toContain('LEGACY_HIDDEN_RESURRECTED_NOTE');
    expect(prompt()).not.toContain('HIDDEN_CANONICAL_NOTE');
    expect(prompt()).not.toContain('Hidden synthetic cafe');
    expect(result.places).toEqual([]);
    expect(db.reads).not.toContain('recommendations');
    expect(db.reads).not.toContain('nearby_places');
  });

  it('publishes only approved places, their notes and validated citations in a mixed set', async () => {
    const db = database({
      property_place_recommendations: [
        canonical(),
        canonical({ id: 'draft', status: 'suggested', host_note: 'DRAFT_ONLY' }),
        canonical({ id: 'hidden', status: 'hidden', host_note: 'HIDDEN_ONLY' }),
        canonical({ id: 'foreign', property_id: 'other-property', host_note: 'FOREIGN_ONLY' }),
      ],
      recommendations: [legacy()],
    });
    const result = await answerGuestQuestion(db.client, opts);
    expect(prompt()).toContain('APPROVED_SYNTHETIC_NOTE');
    for (const note of ['DRAFT_ONLY', 'HIDDEN_ONLY', 'FOREIGN_ONLY', 'LEGACY_SYNTHETIC_NOTE']) {
      expect(prompt()).not.toContain(note);
    }
    expect(result.places).toEqual([{ id: ids.escalation, name: 'Approved synthetic cafe', category: 'cafe' }]);
    expect(db.writes).toEqual([]);
  });

  it.each(['57014', '42501', 'PGRST200'])('does not resurrect legacy data on canonical read failure %s', async (code) => {
    const db = database({ recommendations: [legacy()] }, code);
    const result = await answerGuestQuestion(db.client, opts);
    expect(prompt()).not.toContain('LEGACY_SYNTHETIC_NOTE');
    expect(result.places).toEqual([]);
    expect(db.reads).not.toContain('recommendations');
    expect(db.reads).not.toContain('nearby_places');
  });

  it.each([undefined, '42P01', 'PGRST205'])('supports genuinely unmigrated properties (%s) without internal or cross-property legacy rows', async (code) => {
    const db = database({
      recommendations: [
        legacy(),
        legacy({ id: 'private', name: 'Private synthetic cafe', visibility: 'internal', host_note: 'INTERNAL_LEGACY_NOTE' }),
        legacy({ id: 'foreign', name: 'Foreign synthetic cafe', property_id: 'other-property', host_note: 'FOREIGN_LEGACY_NOTE' }),
        legacy({ id: 'hidden', name: 'Hidden synthetic cafe', hidden: true, host_note: 'HIDDEN_LEGACY_NOTE' }),
        legacy({ id: 'unapproved', name: 'Draft synthetic cafe', approved: false, host_note: 'DRAFT_LEGACY_NOTE' }),
        legacy({ id: 'deleted', name: 'Deleted synthetic cafe', deleted_at: '2026-09-01', host_note: 'DELETED_LEGACY_NOTE' }),
      ],
    }, code);
    const result = await answerGuestQuestion(db.client, opts);
    expect(prompt()).toContain('LEGACY_SYNTHETIC_NOTE');
    for (const note of ['INTERNAL_LEGACY_NOTE', 'FOREIGN_LEGACY_NOTE', 'HIDDEN_LEGACY_NOTE', 'DRAFT_LEGACY_NOTE', 'DELETED_LEGACY_NOTE']) {
      expect(prompt()).not.toContain(note);
    }
    expect(result.places).toEqual([{ id: ids.message, name: 'Legacy synthetic cafe', category: 'cafe' }]);
  });
});
