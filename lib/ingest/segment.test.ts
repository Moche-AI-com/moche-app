import { describe, expect, it } from 'vitest';
import {
  dedupeSegments,
  normalizeSegment,
  normalizeSegments,
  splitStandardizedMarkdown,
  truncateAtSentenceBoundary,
} from './segment';

describe('setup Brain segment validation', () => {
  const usefulText = 'Guests can use the side entrance after 4 PM and should lock it when leaving.';

  it('rejects an enum-invalid segment without useful text', () => {
    expect(normalizeSegment({ title: 'Unknown', text: 'too short', category: 'not_real' })).toBeNull();
  });

  it('routes substantial enum-invalid content to host Q&A instead of product URLs', () => {
    const segment = normalizeSegment({ title: 'Other details', text: usefulText, category: 'not_real' });
    expect(segment?.category).toBe('host_qa');
    expect(segment?.category).not.toBe('product_urls');
  });

  it('rejects absent or overly long titles and too-short text', () => {
    expect(normalizeSegment({ title: '', text: usefulText, category: 'core' })).toBeNull();
    expect(normalizeSegment({ title: 'x'.repeat(201), text: usefulText, category: 'core' })).toBeNull();
    expect(normalizeSegment({ title: 'Short', text: 'too short', category: 'core' })).toBeNull();
  });

  it('forces internal notes to internal while defaulting other categories to guest', () => {
    const internal = normalizeSegment({ title: 'Turnover note', text: usefulText, category: 'internal_notes', visibility: 'guest' });
    const guest = normalizeSegment({ title: 'Parking', text: usefulText, category: 'transportation', visibility: 'internal' });
    expect(internal?.visibility).toBe('internal');
    expect(guest?.visibility).toBe('guest');
  });

  it('truncates text at a sentence boundary within the storage limit', () => {
    const text = `${'a'.repeat(19_990)}. This second sentence should not fit.`;
    const truncated = truncateAtSentenceBoundary(text, 20_000);
    expect(truncated.length).toBeLessThanOrEqual(20_000);
    expect(truncated.endsWith('.')).toBe(true);
  });

  it('deduplicates case and punctuation insensitive titles', () => {
    const segments = normalizeSegments([
      { title: 'Check-in instructions!', text: usefulText, category: 'checkin_checkout' },
      { title: 'check in instructions', text: `${usefulText} Bring the access code.`, category: 'checkin_checkout' },
      { title: 'Parking', text: usefulText, category: 'transportation' },
    ]);
    expect(dedupeSegments(segments)).toHaveLength(2);
  });

  it('caps normalized results at 24 segments', () => {
    const raw = Array.from({ length: 30 }, (_, index) => ({
      title: `Detail ${index}`,
      text: `${usefulText} ${index}`,
      category: 'core',
    }));
    expect(normalizeSegments(raw)).toHaveLength(24);
  });
});

describe('standardized markdown fallback', () => {
  it('maps known headings into their Brain sections', () => {
    const segments = splitStandardizedMarkdown([
      '## Overview',
      'A bright two-bedroom home near the park with plenty of natural light.',
      '## Amenities',
      'The kitchen includes a coffee maker, dishwasher, and washer-dryer for guests.',
      '## House Rules & Policies',
      'No smoking, parties, or unregistered overnight guests are permitted.',
      '## Getting There / Parking',
      'One reserved driveway space is available and the bus stop is two blocks away.',
    ].join('\n'));

    expect(segments.map((segment) => segment.category)).toEqual([
      'core', 'appliances', 'house_rules', 'transportation',
    ]);
    expect(segments.every((segment) => segment.visibility === 'guest')).toBe(true);
  });

  it('keeps unheaded fallback content in a sane core segment', () => {
    const segments = splitStandardizedMarkdown('The apartment has a balcony, secure entry, and reliable WiFi for guests.');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ category: 'core', title: 'Property details' });
  });
});
