import { describe, expect, it } from 'vitest';
import { knowledgeReviewSummary, resolveScope } from '@/lib/dashboard/scope';

describe('resolveScope', () => {
  const allowed = ['property-a', 'property-b'];

  it('honours an allowed requested property', () => {
    expect(resolveScope('property-b', allowed)).toBe('property-b');
  });

  it('discards missing, empty, and unauthorized property ids', () => {
    expect(resolveScope(null, allowed)).toBeNull();
    expect(resolveScope(undefined, allowed)).toBeNull();
    expect(resolveScope('', allowed)).toBeNull();
    expect(resolveScope('property-other-account', allowed)).toBeNull();
  });
});

describe('knowledgeReviewSummary', () => {
  const now = new Date('2026-08-11T18:00:00Z');

  it('counts pending drafts, affected properties, and the oldest age', () => {
    const summary = knowledgeReviewSummary(
      [
        { property_id: 'property-a', created_at: '2026-08-11T09:00:00Z' },
        { property_id: 'property-b', created_at: '2026-08-08T09:00:00Z' },
        { property_id: 'property-a', created_at: '2026-08-10T09:00:00Z' },
      ],
      now,
    );

    expect(summary).toEqual({
      pending: 3,
      affectedProperties: 2,
      oldestLabel: '3 days ago',
      detail: '3 suggestions to approve. Oldest arrived 3 days ago.',
    });
  });

  it('keeps the queue empty state wording from queueSummary', () => {
    expect(knowledgeReviewSummary([], now)).toEqual({
      pending: 0,
      affectedProperties: 0,
      oldestLabel: null,
      detail: 'Nothing waiting. Anything the AI learns after setup lands here first.',
    });
  });
});
