import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_REQUIREMENTS,
  READINESS_CATEGORIES,
  computeReadiness,
  type ReadinessStatusInput,
} from './readiness';

const fullySatisfied: ReadinessStatusInput[] = KNOWLEDGE_REQUIREMENTS.map((requirement) => ({
  requirementKey: requirement.key,
  status: 'satisfied',
}));

describe('computeReadiness', () => {
  it('defines weights that sum to exactly one', () => {
    expect(READINESS_CATEGORIES.reduce((sum, category) => sum + category.weight, 0)).toBeCloseTo(1, 10);
  });

  it('scores an empty property at zero and reports every requirement missing', () => {
    const result = computeReadiness();
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(KNOWLEDGE_REQUIREMENTS.length);
    expect(result.categories.flatMap((category) => category.missing)).toEqual(result.missing);
  });

  it('scores a fully satisfied property at 100', () => {
    const result = computeReadiness({ statuses: fullySatisfied });
    expect(result.score).toBe(100);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('awards proportional partial credit without hiding the gap', () => {
    const result = computeReadiness({
      statuses: [{ requirementKey: 'house_rules', status: 'partial' }],
    });
    expect(result.score).toBe(7.5);
    expect(result.missing).toContainEqual(expect.objectContaining({ requirementKey: 'house_rules' }));
  });

  it('always derives score and missing items from the same statuses', () => {
    const result = computeReadiness({
      statuses: [
        ...fullySatisfied.filter((item) => item.requirementKey !== 'arrival_instructions'),
        { requirementKey: 'arrival_instructions', status: 'partial' },
      ],
    });
    expect(result.score).toBe(93.75);
    expect(result.missing.map((item) => item.requirementKey)).toEqual(['arrival_instructions']);
    expect(result.categories.find((category) => category.key === 'arrival_access_departure')?.missing)
      .toEqual(result.missing);
  });
});
