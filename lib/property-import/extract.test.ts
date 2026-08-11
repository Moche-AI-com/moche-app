import { describe, expect, it } from 'vitest';
import { buildListingDraft, detectListingProvider } from './extract';

describe('listing import extraction', () => {
  it('detects known listing providers from the URL hostname', () => {
    expect(detectListingProvider('https://www.airbnb.com/rooms/12')).toBe('airbnb');
    expect(detectListingProvider('https://example.test/listing')).toBe('example.test');
  });

  it('creates exactly the five host review groups without inventing facts', () => {
    const draft = buildListingDraft({
      title: 'Cedar Cottage', sourceUrl: 'https://www.vrbo.com/123',
      text: 'Cedar Cottage sleeps six guests. Check-in starts at 4pm with a key box. No smoking or parties. Wi-Fi and a pool are available. Frequently asked questions are in the welcome book.',
    }, 'https://www.vrbo.com/123');
    expect(draft.provider).toBe('vrbo');
    expect(draft.reviewGroups.map((group) => group.key)).toEqual([
      'property_details',
      'amenities',
      'rules',
      'arrival_access',
      'appliances_faqs',
    ]);
    expect(draft.reviewGroups.find((group) => group.key === 'rules')?.text).toContain('No smoking');
  });
});
