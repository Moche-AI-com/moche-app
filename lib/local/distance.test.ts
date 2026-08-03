import { describe, it, expect } from 'vitest';
import {
  formatDistance,
  formatDistanceApprox,
  formatDistanceAway,
  formatRadiusMiles,
} from './distance';

describe('formatDistance', () => {
  it('returns null for an unknown distance', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
  });

  it('returns null for non-finite or negative input rather than a bogus figure', () => {
    expect(formatDistance(NaN)).toBeNull();
    expect(formatDistance(Infinity)).toBeNull();
    expect(formatDistance(-5)).toBeNull();
  });

  it('uses feet below a tenth of a mile', () => {
    // 30 m ~= 98 ft -> nearest 50
    expect(formatDistance(30)).toBe('100 ft');
    // 100 m ~= 328 ft -> nearest 50
    expect(formatDistance(100)).toBe('350 ft');
  });

  it('never renders a zero-foot distance', () => {
    expect(formatDistance(0)).toBe('50 ft');
    expect(formatDistance(1)).toBe('50 ft');
  });

  it('switches to miles at the tenth-of-a-mile cutoff', () => {
    // 0.1 mi is 160.9344 m exactly.
    expect(formatDistance(160)).toBe('500 ft');
    expect(formatDistance(161)).toBe('0.1 mi');
  });

  it('renders miles to one decimal place', () => {
    expect(formatDistance(1609.344)).toBe('1.0 mi');
    expect(formatDistance(804.672)).toBe('0.5 mi');
    expect(formatDistance(3218.688)).toBe('2.0 mi');
  });

  it('converts the old 2 km discovery radius to the expected mileage', () => {
    expect(formatDistance(2000)).toBe('1.2 mi');
  });

  it('never emits metric units at any magnitude', () => {
    for (let m = 0; m <= 20000; m += 7) {
      const out = formatDistance(m)!;
      expect(out).toMatch(/^\d+(\.\d)? (ft|mi)$/);
    }
  });

  it('increases monotonically as the input grows', () => {
    const parse = (s: string) => {
      const [n, unit] = s.split(' ');
      return unit === 'ft' ? Number(n) / 5280 : Number(n);
    };
    let prev = 0;
    for (let m = 0; m <= 10000; m += 13) {
      const miles = parse(formatDistance(m)!);
      expect(miles).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = miles;
    }
  });
});

describe('formatDistanceApprox', () => {
  it('wraps a known distance for inline prose', () => {
    expect(formatDistanceApprox(2000)).toBe(' (~1.2 mi)');
  });

  it('collapses to an empty string when unknown so concatenation stays safe', () => {
    expect(formatDistanceApprox(null)).toBe('');
  });
});

describe('formatDistanceAway', () => {
  it('reads as a standalone phrase', () => {
    expect(formatDistanceAway(2000)).toBe('1.2 mi away');
    expect(formatDistanceAway(30)).toBe('100 ft away');
  });

  it('returns null when unknown', () => {
    expect(formatDistanceAway(null)).toBeNull();
  });
});

describe('formatRadiusMiles', () => {
  it('spells out the unit for radius prose', () => {
    expect(formatRadiusMiles(2000)).toBe('1.2 miles');
    expect(formatRadiusMiles(3000)).toBe('1.9 miles');
  });
});
