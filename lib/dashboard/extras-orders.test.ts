import { describe, it, expect } from 'vitest';
import {
  ARCHIVED_EXTRAS_ORDER_STATUSES,
  EXTRAS_ORDER_STATUS_LABEL,
  EXTRAS_ORDER_TRANSITIONS,
  canTransitionExtrasOrder,
  isArchivedExtrasOrderStatus,
  primaryExtrasOrderActions,
  tallyByExtra,
  type ExtrasOrderStatus,
} from './extras-orders';

const ALL: ExtrasOrderStatus[] = ['requested', 'confirmed', 'fulfilled', 'declined', 'cancelled'];

describe('extras order status vocabulary', () => {
  it('labels every status in the enum', () => {
    for (const s of ALL) {
      expect(EXTRAS_ORDER_STATUS_LABEL[s]).toBeTruthy();
    }
    expect(Object.keys(EXTRAS_ORDER_STATUS_LABEL).sort()).toEqual([...ALL].sort());
  });

  // Guards the drift risk between this file and the database's GENERATED
  // lifecycle_status column, which is defined as:
  //   status in ('fulfilled','declined','cancelled') -> archived, else active
  it('mirrors the database lifecycle_status expression exactly', () => {
    expect([...ARCHIVED_EXTRAS_ORDER_STATUSES].sort()).toEqual(['cancelled', 'declined', 'fulfilled']);
    expect(isArchivedExtrasOrderStatus('requested')).toBe(false);
    expect(isArchivedExtrasOrderStatus('confirmed')).toBe(false);
    expect(isArchivedExtrasOrderStatus('fulfilled')).toBe(true);
    expect(isArchivedExtrasOrderStatus('declined')).toBe(true);
    expect(isArchivedExtrasOrderStatus('cancelled')).toBe(true);
  });
});

describe('canTransitionExtrasOrder', () => {
  it('is idempotent for a no-op, so a double-tap is not an error', () => {
    for (const s of ALL) expect(canTransitionExtrasOrder(s, s)).toBe(true);
  });

  it('walks the happy path forward', () => {
    expect(canTransitionExtrasOrder('requested', 'confirmed')).toBe(true);
    expect(canTransitionExtrasOrder('confirmed', 'fulfilled')).toBe(true);
  });

  it('lets a host skip straight to fulfilled from requested', () => {
    expect(canTransitionExtrasOrder('requested', 'fulfilled')).toBe(true);
  });

  it('refuses declined -> fulfilled, which would erase the refusal', () => {
    expect(canTransitionExtrasOrder('declined', 'fulfilled')).toBe(false);
  });

  it('treats cancelled as final', () => {
    for (const to of ALL.filter((s) => s !== 'cancelled')) {
      expect(canTransitionExtrasOrder('cancelled', to)).toBe(false);
    }
    expect(EXTRAS_ORDER_TRANSITIONS.cancelled).toHaveLength(0);
  });

  it('allows the two documented undo paths', () => {
    expect(canTransitionExtrasOrder('fulfilled', 'confirmed')).toBe(true);
    expect(canTransitionExtrasOrder('declined', 'requested')).toBe(true);
  });

  it('never lists a status as a transition target of itself', () => {
    for (const s of ALL) expect(EXTRAS_ORDER_TRANSITIONS[s]).not.toContain(s);
  });
});

describe('primaryExtrasOrderActions', () => {
  it('offers confirm and decline on a fresh request', () => {
    expect(primaryExtrasOrderActions('requested').map((a) => a.to)).toEqual(['confirmed', 'declined']);
  });

  it('offers exactly one recovery action on each terminal-ish status', () => {
    expect(primaryExtrasOrderActions('fulfilled')).toHaveLength(1);
    expect(primaryExtrasOrderActions('declined')).toHaveLength(1);
    expect(primaryExtrasOrderActions('cancelled')).toHaveLength(0);
  });

  // The whole point of colocating the state machine: a button that the API
  // would reject must never be rendered.
  it('only ever offers transitions the state machine permits', () => {
    for (const s of ALL) {
      for (const action of primaryExtrasOrderActions(s)) {
        expect(canTransitionExtrasOrder(s, action.to)).toBe(true);
      }
    }
  });
});

describe('tallyByExtra', () => {
  it('sums quantities per catalog item', () => {
    const t = tallyByExtra([
      { extra_id: 'a', quantity: 2 },
      { extra_id: 'b', quantity: 1 },
      { extra_id: 'a', quantity: 3 },
    ]);
    expect(t.get('a')).toBe(5);
    expect(t.get('b')).toBe(1);
  });

  it('buckets orphaned orders under the empty key instead of throwing', () => {
    const t = tallyByExtra([{ extra_id: null, quantity: 4 }]);
    expect(t.get('')).toBe(4);
  });

  it('returns an empty map for no orders', () => {
    expect(tallyByExtra([]).size).toBe(0);
  });
});
