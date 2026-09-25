import { describe, expect, it } from 'vitest';
import { guestGuideAccess } from './guide-access';

describe('Local Guide authorization', () => {
  it('allows a verified guest only for a live property', () => {
    expect(guestGuideAccess('live', true, false)).toBe('allow');
    expect(guestGuideAccess('draft', true, false)).toBe('not_found');
    expect(guestGuideAccess('paused', true, false)).toBe('not_found');
  });
  it('directs an unverified live-property guest to verification', () => {
    expect(guestGuideAccess('live', false, false)).toBe('verify');
  });
  it('allows a property-scoped host to preview draft and paused guides', () => {
    expect(guestGuideAccess('draft', false, true)).toBe('allow');
    expect(guestGuideAccess('paused', false, true)).toBe('allow');
    expect(guestGuideAccess('live', false, true)).toBe('allow');
  });
  it('never exposes an archived guide on this route', () => {
    expect(guestGuideAccess('archived', true, true)).toBe('not_found');
    expect(guestGuideAccess('archived', false, false)).toBe('not_found');
  });
});
