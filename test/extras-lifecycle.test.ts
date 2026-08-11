import { describe, expect, it } from 'vitest';
import {
  EXTRAS_TRANSITIONS,
  canTransition,
  nextStatesFor,
  TERMINAL_EXTRAS_STATUSES,
  type ExtrasFulfillmentStatus,
} from '@/lib/extras/lifecycle';

describe('extras lifecycle', () => {
  it('allows every declared transition for its permitted actor', () => {
    for (const [from, transitions] of Object.entries(EXTRAS_TRANSITIONS) as Array<
      [ExtrasFulfillmentStatus, readonly { to: ExtrasFulfillmentStatus; actors: readonly ('guest' | 'host')[] }[]]
    >) {
      for (const transition of transitions) {
        for (const actor of transition.actors) {
          expect(canTransition(from, transition.to, actor)).toBe(true);
        }
      }
    }
  });

  it('rejects representative illegal and actor-restricted transitions', () => {
    expect(canTransition('requested', 'scheduled', 'guest')).toBe(false);
    expect(canTransition('requested', 'accepted', 'guest')).toBe(false);
    expect(canTransition('needs_details', 'accepted', 'guest')).toBe(false);
    expect(canTransition('accepted', 'fulfilled', 'host')).toBe(false);
    expect(canTransition('scheduled', 'needs_details', 'host')).toBe(false);
  });

  it('only exposes actions for the relevant actor', () => {
    expect(nextStatesFor('needs_details', 'guest')).toEqual(['requested', 'canceled']);
    expect(nextStatesFor('needs_details', 'host')).toEqual(['accepted', 'declined', 'canceled']);
    expect(nextStatesFor('accepted', 'guest')).toEqual([]);
  });

  it('rejects every transition from a terminal state', () => {
    for (const status of TERMINAL_EXTRAS_STATUSES) {
      expect(nextStatesFor(status, 'guest')).toEqual([]);
      expect(nextStatesFor(status, 'host')).toEqual([]);
      expect(canTransition(status, 'requested', 'guest')).toBe(false);
      expect(canTransition(status, 'requested', 'host')).toBe(false);
    }
  });
});
