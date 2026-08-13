import { describe, it, expect } from 'vitest';
import {
  classifyFreshness,
  selectFreshnessItems,
  shouldSend,
  renderDigest,
  EXPIRING_SOON_DAYS,
  UNVERIFIED_AFTER_DAYS,
  type FreshnessValueInput,
  type PropertyDigest,
} from './freshness';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function value(over: Partial<FreshnessValueInput> = {}): FreshnessValueInput {
  return {
    propertyId: 'p1',
    fieldId: 'wifi_password',
    label: 'WiFi password',
    ttlExpiresAt: null,
    verifiedAt: null,
    hardBlock: false,
    ...over,
  };
}

describe('classifyFreshness', () => {
  it('treats a past TTL as expired', () => {
    expect(classifyFreshness(value({ ttlExpiresAt: at(-1) }), NOW)).toBe('expired');
    expect(classifyFreshness(value({ ttlExpiresAt: at(0) }), NOW)).toBe('expired');
  });

  it('warns inside the expiry window and stays quiet outside it', () => {
    expect(classifyFreshness(value({ ttlExpiresAt: at(EXPIRING_SOON_DAYS) }), NOW)).toBe('expiring_soon');
    expect(classifyFreshness(value({ ttlExpiresAt: at(EXPIRING_SOON_DAYS + 1) }), NOW)).toBe('fresh');
  });

  it('does not treat a never-verified value as stale on its own', () => {
    expect(classifyFreshness(value({ verifiedAt: null }), NOW)).toBe('fresh');
  });

  it('surfaces a long-unverified value with no TTL', () => {
    expect(classifyFreshness(value({ verifiedAt: at(-UNVERIFIED_AFTER_DAYS) }), NOW)).toBe('unverified');
    expect(classifyFreshness(value({ verifiedAt: at(-(UNVERIFIED_AFTER_DAYS - 1)) }), NOW)).toBe('fresh');
  });

  it('ignores an unparseable timestamp instead of crying stale', () => {
    expect(classifyFreshness(value({ ttlExpiresAt: 'not-a-date' }), NOW)).toBe('fresh');
    expect(classifyFreshness(value({ verifiedAt: 'not-a-date' }), NOW)).toBe('fresh');
  });
});

describe('selectFreshnessItems', () => {
  it('drops fresh values and orders expired, hard blocks, then soonest', () => {
    const items = selectFreshnessItems(
      [
        value({ fieldId: 'a', ttlExpiresAt: at(10) }),
        value({ fieldId: 'b', ttlExpiresAt: at(-5) }),
        value({ fieldId: 'c', ttlExpiresAt: at(-5), hardBlock: true }),
        value({ fieldId: 'd', ttlExpiresAt: at(90) }),
        value({ fieldId: 'e', verifiedAt: at(-400) }),
      ],
      NOW,
    );
    expect(items.map((i) => i.fieldId)).toEqual(['c', 'b', 'a', 'e']);
    expect(items[0].bucket).toBe('expired');
    expect(items[2].daysUntilExpiry).toBe(10);
  });
});

function digest(over: Partial<PropertyDigest> = {}): PropertyDigest {
  return {
    propertyId: 'p1',
    propertyName: 'Seaside Cottage',
    hostEmail: 'host@example.com',
    items: [],
    missingHardBlockCount: 0,
    ...over,
  };
}

describe('shouldSend', () => {
  it('sends nothing when there is nothing to report', () => {
    expect(shouldSend(digest())).toBe(false);
  });

  it('sends for an outstanding required field even with no stale values', () => {
    expect(shouldSend(digest({ missingHardBlockCount: 1 }))).toBe(true);
  });
});

describe('renderDigest', () => {
  const items = selectFreshnessItems(
    [
      value({ fieldId: 'wifi_password', label: 'WiFi password', ttlExpiresAt: at(-3), hardBlock: true }),
      value({ fieldId: 'parking', label: 'Parking', ttlExpiresAt: at(7) }),
    ],
    NOW,
  );

  it('names fields and their state without reproducing any stored value', () => {
    const out = renderDigest(digest({ items, missingHardBlockCount: 2 }), 'https://www.moche-ai.com/dashboard');
    expect(out.subject).toBe('Seaside Cottage: needs attention');
    expect(out.text).toContain('WiFi password (required) — expired 3 days ago');
    expect(out.text).toContain('Parking — expires in 7 days');
    expect(out.text).toContain('2 required fields still has no answer.');
    expect(out.text).toContain('https://www.moche-ai.com/dashboard');
    // A digest about credentials going stale must not itself carry one.
    expect(out.text).not.toMatch(/hunter2|password:/i);
  });

  it('states the mail is non-urgent so it is not mistaken for an alert', () => {
    const out = renderDigest(digest({ items }), 'https://x');
    expect(out.text).toContain('Anything urgent is sent to you separately.');
  });

  it('caps the list and says how many were omitted', () => {
    const many = selectFreshnessItems(
      Array.from({ length: 14 }, (_, i) => value({ fieldId: `f${i}`, label: `Field ${i}`, ttlExpiresAt: at(-i - 1) })),
      NOW,
    );
    const out = renderDigest(digest({ items: many }), 'https://x');
    expect(out.text).toContain('...and 4 more.');
  });

  it('softens the subject when nothing has actually expired yet', () => {
    const soon = selectFreshnessItems([value({ ttlExpiresAt: at(5) })], NOW);
    expect(renderDigest(digest({ items: soon }), 'https://x').subject).toBe('Seaside Cottage: weekly check');
  });
});
