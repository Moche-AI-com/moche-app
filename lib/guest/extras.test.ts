import { describe, it, expect } from 'vitest';
import {
  EXTRAS_CATEGORIES,
  DEFAULT_EXTRA_CATEGORY,
  MAX_EXTRA_QUANTITY,
  clampExtraQuantity,
  extraCategory,
  extraQuantityCeiling,
  groupExtrasByCategory,
  isExtraCategory,
  normalizeExtraCategory,
  quantityAdvisory,
  sortExtras,
} from './extras';

const extra = (id: string, title: string, category?: string | null, is_favorite = false) => ({
  id,
  title,
  category,
  is_favorite,
});

describe('categories', () => {
  it('exposes a fixed set with unique ids and a `more` fallback', () => {
    const ids = EXTRAS_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_EXTRA_CATEGORY);
  });

  it('normalizes unknown, empty, and null values to the fallback', () => {
    for (const value of [null, undefined, '', 'upsells', 'Comfort', 42, {}]) {
      expect(normalizeExtraCategory(value)).toBe(DEFAULT_EXTRA_CATEGORY);
    }
    expect(normalizeExtraCategory('food')).toBe('food');
  });

  it('recognizes only the configured ids', () => {
    expect(isExtraCategory('arrival')).toBe(true);
    expect(isExtraCategory('arrivals')).toBe(false);
  });

  it('resolves a category record, falling back rather than throwing', () => {
    expect(extraCategory('food').label).toBe('Food & drink');
    expect(extraCategory('nope').id).toBe(DEFAULT_EXTRA_CATEGORY);
  });

  it('never uses the word upsell in a guest-facing label or hint', () => {
    for (const c of EXTRAS_CATEGORIES) {
      expect(`${c.label} ${c.hint}`.toLowerCase()).not.toContain('upsell');
    }
  });
});

describe('clampExtraQuantity', () => {
  it('defaults to 1 for junk input', () => {
    for (const value of [null, undefined, 'abc', NaN, {}]) {
      expect(clampExtraQuantity(value)).toBe(1);
    }
  });

  it('floors fractions and rejects values below 1', () => {
    expect(clampExtraQuantity(2.9)).toBe(2);
    expect(clampExtraQuantity(0)).toBe(1);
    expect(clampExtraQuantity(-5)).toBe(1);
  });

  it('caps at the global ceiling', () => {
    expect(clampExtraQuantity(999)).toBe(MAX_EXTRA_QUANTITY);
  });

  it("respects the host's per-item ceiling when it is lower", () => {
    expect(clampExtraQuantity(9, 3)).toBe(3);
    expect(clampExtraQuantity(2, 3)).toBe(2);
    expect(extraQuantityCeiling(3)).toBe(3);
  });

  it('ignores a nonsensical per-item ceiling', () => {
    expect(clampExtraQuantity(4, 0)).toBe(4);
    expect(clampExtraQuantity(4, -2)).toBe(4);
    expect(clampExtraQuantity(4, null)).toBe(4);
    expect(extraQuantityCeiling(null)).toBe(MAX_EXTRA_QUANTITY);
  });

  it('never lets a host ceiling exceed the global ceiling', () => {
    expect(extraQuantityCeiling(50)).toBe(MAX_EXTRA_QUANTITY);
  });
});

describe('quantityAdvisory', () => {
  it('is advisory only and never mentions tax, fees, or a total', () => {
    for (const q of [1, 2, 7]) {
      const line = quantityAdvisory(q).toLowerCase();
      expect(line).not.toContain('tax');
      expect(line).not.toContain('fee');
      expect(line).not.toContain('total');
      expect(line).not.toContain('upsell');
      expect(line.length).toBeGreaterThan(10);
    }
  });

  it('tells a single-item guest nothing is charged now', () => {
    expect(quantityAdvisory(1)).toContain('Nothing is charged now');
  });
});

describe('sortExtras (P5-06: is_favorite DESC, category ASC, name ASC)', () => {
  it('puts favorites first regardless of category or name', () => {
    const sorted = sortExtras([
      extra('a', 'Airport pickup', 'transport'),
      extra('b', 'Zebra tour', 'experiences', true),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('orders by category ascending within the same favorite tier', () => {
    const sorted = sortExtras([
      extra('t', 'Same name', 'transport'),
      extra('a', 'Same name', 'arrival'),
      extra('f', 'Same name', 'food'),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'f', 't']);
  });

  it('orders by name ascending when favorite and category tie', () => {
    const sorted = sortExtras([
      extra('c', 'Croissants', 'food'),
      extra('a', 'apple basket', 'food'),
      extra('b', 'Bread', 'food'),
    ]);
    // Case-insensitive, so a lowercase title is not banished to the end.
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('is total and stable when every sort key ties', () => {
    const input = [extra('z', 'Tie', 'food'), extra('a', 'Tie', 'food'), extra('m', 'Tie', 'food')];
    expect(sortExtras(input).map((e) => e.id)).toEqual(['a', 'm', 'z']);
    // Repeated calls agree, and the input is not mutated.
    expect(sortExtras(input).map((e) => e.id)).toEqual(['a', 'm', 'z']);
    expect(input.map((e) => e.id)).toEqual(['z', 'a', 'm']);
  });

  it('treats a null or unknown category as the fallback for ordering', () => {
    const sorted = sortExtras([extra('n', 'Item', null), extra('f', 'Item', 'food')]);
    // 'food' < 'more', so the categorized item comes first.
    expect(sorted.map((e) => e.id)).toEqual(['f', 'n']);
  });

  it('handles an empty list', () => {
    expect(sortExtras([])).toEqual([]);
  });
});

describe('groupExtrasByCategory', () => {
  it('omits empty categories and keeps sorted order inside each group', () => {
    const groups = groupExtrasByCategory([
      extra('c', 'Croissants', 'food'),
      extra('a', 'Apple basket', 'food'),
      extra('p', 'Parking', 'transport'),
    ]);
    expect(groups.map((g) => g.category.id)).toEqual(['food', 'transport']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('pulls a favorite item\u2019s category to the front of the tile list', () => {
    const groups = groupExtrasByCategory([
      extra('a', 'Late checkout', 'arrival'),
      extra('t', 'Airport pickup', 'transport', true),
    ]);
    expect(groups.map((g) => g.category.id)).toEqual(['transport', 'arrival']);
  });

  it('buckets uncategorized items under the fallback', () => {
    const groups = groupExtrasByCategory([extra('x', 'Mystery', null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category.id).toBe(DEFAULT_EXTRA_CATEGORY);
  });

  it('handles an empty list', () => {
    expect(groupExtrasByCategory([])).toEqual([]);
  });
});
