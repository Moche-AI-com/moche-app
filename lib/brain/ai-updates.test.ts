// Href contract for the AI Updates surface.
//
// Moved from lib/dashboard/knowledge-queue-link.test.ts when the queue became a
// per-property tab. Every case from that file is preserved below with the same
// intent; the expected paths changed because the destination changed, which is an
// intentional contract change flagged in the PR, not a relaxed assertion. New
// cases cover the roll-up and the view resolver.

import { describe, expect, it } from 'vitest';
import {
  AI_UPDATES_LABEL,
  AI_UPDATES_ROLLUP_PATH,
  aiUpdatesRollupHref,
  primaryAiUpdatesHref,
  propertyAiUpdatesHref,
  resolveAiUpdatesView,
} from './ai-updates';

describe('propertyAiUpdatesHref', () => {
  it('scopes to a property', () => {
    expect(propertyAiUpdatesHref('p1')).toBe('/dashboard/properties/p1/updates');
  });

  it('keeps the reviewed tab working', () => {
    expect(propertyAiUpdatesHref('p1', 'reviewed')).toBe('/dashboard/properties/p1/updates?view=reviewed');
  });

  it('treats an explicit pending view as the default, emitting no query', () => {
    expect(propertyAiUpdatesHref('p1', 'pending')).toBe('/dashboard/properties/p1/updates');
  });
});

describe('aiUpdatesRollupHref', () => {
  it('returns the account-wide index path', () => {
    expect(aiUpdatesRollupHref()).toBe('/dashboard/updates');
  });

  it('keeps the legacy route, because bookmarks and notification deep-links use it', () => {
    expect(AI_UPDATES_ROLLUP_PATH).toBe('/dashboard/updates');
  });
});

describe('resolveAiUpdatesView', () => {
  it('defaults to pending', () => {
    expect(resolveAiUpdatesView(undefined)).toBe('pending');
    expect(resolveAiUpdatesView(null)).toBe('pending');
    expect(resolveAiUpdatesView('')).toBe('pending');
  });

  it('accepts reviewed', () => {
    expect(resolveAiUpdatesView('reviewed')).toBe('reviewed');
  });

  it('takes the first value of a repeated param and rejects anything unknown', () => {
    expect(resolveAiUpdatesView(['reviewed', 'pending'])).toBe('reviewed');
    expect(resolveAiUpdatesView('../../etc/passwd')).toBe('pending');
    expect(resolveAiUpdatesView('REVIEWED')).toBe('pending');
  });
});

describe('primaryAiUpdatesHref', () => {
  const rows = [
    { propertyId: 'a', pending: 3 },
    { propertyId: 'b', pending: 0 },
  ];

  it('honours an active dashboard scope above everything else', () => {
    expect(primaryAiUpdatesHref(rows, 'b')).toBe('/dashboard/properties/b/updates');
  });

  it('deep-links when exactly one property has pending drafts', () => {
    expect(primaryAiUpdatesHref(rows)).toBe('/dashboard/properties/a/updates');
  });

  it('falls back to the roll-up when several properties are affected, rather than guessing', () => {
    expect(
      primaryAiUpdatesHref([
        { propertyId: 'a', pending: 3 },
        { propertyId: 'b', pending: 1 },
      ]),
    ).toBe('/dashboard/updates');
  });

  it('falls back to the roll-up when nothing is pending', () => {
    expect(primaryAiUpdatesHref([{ propertyId: 'a', pending: 0 }])).toBe('/dashboard/updates');
  });

  it('falls back to the roll-up for an empty account', () => {
    expect(primaryAiUpdatesHref([])).toBe('/dashboard/updates');
  });
});

describe('naming', () => {
  it('calls the surface AI Updates and never Reviews', () => {
    expect(AI_UPDATES_LABEL).toBe('AI Updates');
    expect(AI_UPDATES_LABEL.toLowerCase()).not.toContain('review');
  });
});
