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
  EXTRA_KINDS,
  MAX_EXTRA_OPTIONS,
  normalizeExtraKind,
  isPackageExtra,
  normalizeExtraOptions,
  parseExtraOptionsInput,
  resolveExtraVariant,
  requiresVariantChoice,
  quantitySummary,
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

// --- Guest UX pass: kinds, variants, packages -----------------------------

describe('normalizeExtraKind / isPackageExtra', () => {
  it('treats anything that is not the literal "package" as countable', () => {
    expect(normalizeExtraKind('package')).toBe('package');
    expect(normalizeExtraKind('quantity')).toBe('quantity');
    expect(normalizeExtraKind('Package')).toBe('quantity');
    expect(normalizeExtraKind(null)).toBe('quantity');
    expect(normalizeExtraKind(undefined)).toBe('quantity');
    expect(normalizeExtraKind(7)).toBe('quantity');
  });

  it('exposes the same decision as a boolean', () => {
    expect(isPackageExtra('package')).toBe(true);
    expect(isPackageExtra('quantity')).toBe(false);
    expect(isPackageExtra(null)).toBe(false);
  });

  it('lists both kinds exactly once', () => {
    expect([...EXTRA_KINDS]).toEqual(['quantity', 'package']);
  });
});

describe('normalizeExtraOptions', () => {
  it('trims, drops blanks, and preserves the host order', () => {
    expect(normalizeExtraOptions([' Blue bike ', '', '  ', 'Pink bike'])).toEqual(['Blue bike', 'Pink bike']);
  });

  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(normalizeExtraOptions(['Blue bike', 'blue BIKE'])).toEqual(['Blue bike']);
  });

  it('caps the list so a tile stays scannable', () => {
    const many = Array.from({ length: MAX_EXTRA_OPTIONS + 5 }, (_, i) => `Option ${i}`);
    expect(normalizeExtraOptions(many)).toHaveLength(MAX_EXTRA_OPTIONS);
  });

  it('ignores non-array and non-string input rather than throwing', () => {
    expect(normalizeExtraOptions('Blue bike')).toEqual([]);
    expect(normalizeExtraOptions(null)).toEqual([]);
    expect(normalizeExtraOptions([1, {}, 'Blue bike'])).toEqual(['Blue bike']);
  });
});

describe('parseExtraOptionsInput', () => {
  it('splits the host textarea on newlines', () => {
    expect(parseExtraOptionsInput('Blue bike\nPink bike')).toEqual(['Blue bike', 'Pink bike']);
  });

  it('also accepts a pasted comma-separated list', () => {
    expect(parseExtraOptionsInput('Small, Medium, Large')).toEqual(['Small', 'Medium', 'Large']);
  });

  it('passes an array straight through the same normalizer', () => {
    expect(parseExtraOptionsInput([' Blue ', 'blue'])).toEqual(['Blue']);
  });

  it('returns an empty list for blank or non-string input', () => {
    expect(parseExtraOptionsInput('')).toEqual([]);
    expect(parseExtraOptionsInput('   \n  ')).toEqual([]);
    expect(parseExtraOptionsInput(null)).toEqual([]);
  });
});

describe('resolveExtraVariant', () => {
  const options = ['Blue bike', 'Pink bike'];

  it("returns the HOST's spelling, never the guest's", () => {
    expect(resolveExtraVariant('blue BIKE', options)).toBe('Blue bike');
    expect(resolveExtraVariant('  pink bike  ', options)).toBe('Pink bike');
  });

  it('rejects anything not in the catalog, so a request cannot invent an item', () => {
    expect(resolveExtraVariant('Gold bike', options)).toBeNull();
    expect(resolveExtraVariant('<script>alert(1)</script>', options)).toBeNull();
  });

  it('returns null for blank, missing, or non-string submissions', () => {
    expect(resolveExtraVariant('', options)).toBeNull();
    expect(resolveExtraVariant('   ', options)).toBeNull();
    expect(resolveExtraVariant(null, options)).toBeNull();
    expect(resolveExtraVariant('Blue bike', null)).toBeNull();
  });
});

describe('requiresVariantChoice', () => {
  it('is true for a countable offer that lists options', () => {
    expect(requiresVariantChoice({ kind: 'quantity', options: ['Blue bike', 'Pink bike'] })).toBe(true);
  });

  it('is false when there is nothing to choose between', () => {
    expect(requiresVariantChoice({ kind: 'quantity', options: [] })).toBe(false);
    expect(requiresVariantChoice({ kind: 'quantity' })).toBe(false);
  });

  it('is false for a package, which is bought as one bundle', () => {
    expect(requiresVariantChoice({ kind: 'package', options: ['A', 'B'] })).toBe(false);
  });
});

describe('quantitySummary', () => {
  it('names the unit so a bare number is never ambiguous', () => {
    expect(quantitySummary(3, 'towels')).toBe('3 towels');
    expect(quantitySummary(1, ' beach chairs ')).toBe('1 beach chairs');
  });

  it('falls back to a neutral multiplier when the host named no unit', () => {
    expect(quantitySummary(2, null)).toBe('× 2');
    expect(quantitySummary(2, '   ')).toBe('× 2');
    expect(quantitySummary(2)).toBe('× 2');
  });
});
