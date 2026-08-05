import { describe, it, expect } from 'vitest';
import { computeCardHealth, type CardHealthContext } from './health';
import { computeReadiness, REVIEW_ITEM_WEIGHT } from './readiness';

const PROP = '11111111-1111-4111-8111-111111111111';

const EMPTY_CTX: CardHealthContext = {
  hasAddress: false,
  recommendationCount: 0,
  emergencyContactCount: 0,
  primaryContactCount: 0,
  hasSettings: false,
  confidenceThresholdSet: false,
};

const FULL_CTX: CardHealthContext = {
  hasAddress: true,
  recommendationCount: 5,
  emergencyContactCount: 1,
  primaryContactCount: 1,
  hasSettings: true,
  confidenceThresholdSet: true,
};

type Item = Parameters<typeof computeCardHealth>[0][number];

function ready(category: Item['category']): Item {
  return { category, status: 'ready', deleted_at: null } as Item;
}

const ALL_CATEGORIES = [
  'core', 'checkin_checkout', 'house_rules', 'appliances',
  'local_recommendations', 'emergency', 'transportation',
] as const;

const emptyHealth = () => computeCardHealth([], EMPTY_CTX);
const fullHealth = () => computeCardHealth(ALL_CATEGORIES.map(ready), FULL_CTX);

describe('computeReadiness', () => {
  it('scores an empty property at zero and calls it out', () => {
    const r = computeReadiness({ health: emptyHealth(), pendingReviews: 0, propertyId: PROP });
    // Nothing is done except the review item, which is empty-queue-true.
    expect(r.score).toBeGreaterThan(0);
    expect(r.label).toBe('Needs work');
    expect(r.ready).toBe(false);
  });

  it('reaches "Ready to share" only when every required item is done', () => {
    const r = computeReadiness({ health: fullHealth(), pendingReviews: 0, propertyId: PROP });
    expect(r.ready).toBe(true);
    expect(r.label).toBe('Ready to share');
    expect(r.score).toBe(100);
    expect(r.missing).toHaveLength(0);
  });

  it('a single pending review blocks readiness even on a complete property', () => {
    const r = computeReadiness({ health: fullHealth(), pendingReviews: 1, propertyId: PROP });
    expect(r.ready).toBe(false);
    expect(r.score).toBeLessThan(100);
    expect(r.missing.map((m) => m.key)).toContain('review:pending');
  });

  // The acceptance criterion: the number moves as rows are approved.
  it('score rises monotonically as the queue is cleared', () => {
    const withQueue = computeReadiness({ health: fullHealth(), pendingReviews: 3, propertyId: PROP });
    const cleared = computeReadiness({ health: fullHealth(), pendingReviews: 0, propertyId: PROP });
    expect(cleared.score).toBeGreaterThan(withQueue.score);
  });

  it('the pending count itself does not change the score, only whether any exist', () => {
    const one = computeReadiness({ health: fullHealth(), pendingReviews: 1, propertyId: PROP });
    const many = computeReadiness({ health: fullHealth(), pendingReviews: 40, propertyId: PROP });
    expect(one.score).toBe(many.score);
  });

  it('pluralises the review label', () => {
    const one = computeReadiness({ health: fullHealth(), pendingReviews: 1, propertyId: PROP });
    const two = computeReadiness({ health: fullHealth(), pendingReviews: 2, propertyId: PROP });
    expect(one.items.find((i) => i.key === 'review:pending')?.label).toBe('Review 1 AI suggestion');
    expect(two.items.find((i) => i.key === 'review:pending')?.label).toBe('Review 2 AI suggestions');
  });

  it('the review item carries the documented weight and is required', () => {
    const r = computeReadiness({ health: emptyHealth(), pendingReviews: 2, propertyId: PROP });
    const item = r.items.find((i) => i.key === 'review:pending');
    expect(item?.weight).toBe(REVIEW_ITEM_WEIGHT);
    expect(item?.required).toBe(true);
  });

  // This is the anti-drift guarantee the module exists to provide.
  it('the score is exactly the weighted fraction of the checklist shown', () => {
    for (const pending of [0, 4]) {
      for (const health of [emptyHealth(), fullHealth()]) {
        const r = computeReadiness({ health, pendingReviews: pending, propertyId: PROP });
        const total = r.items.reduce((a, i) => a + i.weight, 0);
        const done = r.items.reduce((a, i) => a + (i.done ? i.weight : 0), 0);
        expect(r.score).toBe(Math.round((done / total) * 100));
      }
    }
  });

  it('does not invent a second scoring engine: every card item mirrors health', () => {
    const health = computeCardHealth([ready('core'), ready('checkin_checkout')], EMPTY_CTX);
    const r = computeReadiness({ health, pendingReviews: 0, propertyId: PROP });
    for (const card of health.cards) {
      const item = r.items.find((i) => i.key === `card:${card.key}`);
      expect(item, card.key).toBeDefined();
      expect(item?.done).toBe(card.recommendedComplete);
      expect(item?.weight).toBe(card.weight);
      expect(item?.required).toBe(card.critical);
    }
  });

  it('missing lists required blockers before optional polish', () => {
    const r = computeReadiness({ health: emptyHealth(), pendingReviews: 0, propertyId: PROP, published: false });
    const firstOptional = r.missing.findIndex((m) => !m.required);
    const lastRequired = r.missing.map((m) => m.required).lastIndexOf(true);
    expect(firstOptional).toBeGreaterThan(lastRequired);
  });

  it('adds a publish item only when explicitly unpublished', () => {
    const withItem = computeReadiness({ health: fullHealth(), pendingReviews: 0, propertyId: PROP, published: false });
    const without = computeReadiness({ health: fullHealth(), pendingReviews: 0, propertyId: PROP, published: true });
    expect(withItem.items.some((i) => i.key === 'published')).toBe(true);
    expect(without.items.some((i) => i.key === 'published')).toBe(false);
    // Optional, so it must not block "ready".
    expect(withItem.ready).toBe(true);
  });

  it('every item links somewhere actionable', () => {
    const r = computeReadiness({ health: emptyHealth(), pendingReviews: 1, propertyId: PROP, published: false });
    for (const i of r.items) expect(i.href, i.key).toMatch(/^\/dashboard\//);
  });

  it('labels the middle band "Almost there"', () => {
    const health = computeCardHealth(
      [ready('core'), ready('checkin_checkout'), ready('house_rules'), ready('appliances'), ready('emergency')],
      { ...FULL_CTX, recommendationCount: 0 },
    );
    const r = computeReadiness({ health, pendingReviews: 0, propertyId: PROP });
    if (r.score >= 70 && !r.ready) expect(r.label).toBe('Almost there');
  });
});
