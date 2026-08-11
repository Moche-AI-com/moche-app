import { describe, expect, it } from 'vitest';
import { knowledgeQueueHref, primaryQueueHref } from './knowledge-queue-link';

describe('knowledgeQueueHref', () => {
  it('returns the bare path with no options', () => {
    expect(knowledgeQueueHref()).toBe('/dashboard/updates');
  });

  it('keeps the reviewed tab working without a property scope', () => {
    expect(knowledgeQueueHref({ view: 'reviewed' })).toBe('/dashboard/updates?view=reviewed');
  });

  it('scopes to a property', () => {
    expect(knowledgeQueueHref({ propertyId: 'p1' })).toBe('/dashboard/updates?property=p1');
  });

  it('combines view and property scope', () => {
    expect(knowledgeQueueHref({ propertyId: 'p1', view: 'reviewed' })).toBe(
      '/dashboard/updates?view=reviewed&property=p1',
    );
  });

  it('treats an explicit pending view as the default', () => {
    expect(knowledgeQueueHref({ view: 'pending' })).toBe('/dashboard/updates');
  });
});

describe('primaryQueueHref', () => {
  const rows = [
    { propertyId: 'a', pending: 3 },
    { propertyId: 'b', pending: 0 },
  ];

  it('honours an active dashboard scope above everything else', () => {
    expect(primaryQueueHref(rows, 'b')).toBe('/dashboard/updates?property=b');
  });

  it('deep-links when exactly one property has pending drafts', () => {
    expect(primaryQueueHref(rows)).toBe('/dashboard/updates?property=a');
  });

  it('falls back to the account queue when several properties are affected', () => {
    expect(
      primaryQueueHref([
        { propertyId: 'a', pending: 3 },
        { propertyId: 'b', pending: 1 },
      ]),
    ).toBe('/dashboard/updates');
  });

  it('falls back to the account queue when nothing is pending', () => {
    expect(primaryQueueHref([{ propertyId: 'a', pending: 0 }])).toBe('/dashboard/updates');
  });
});
