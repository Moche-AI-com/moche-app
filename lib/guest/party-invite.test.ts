import { describe, expect, it } from 'vitest';
import { derivePartyInviteToken, partyInviteCap, partyInviteCapUpdate, partyInviteExpiry } from './party-invite';
import { partyJoinUrl, readPartyTokenFromHash, smsShareHref } from './party-invite-url';

const SECRET = 'x'.repeat(40);
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('party invite tokens', () => {
  it('derives a stable, redeem-schema-compatible token per link', () => {
    const t = derivePartyInviteToken(A, SECRET);
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(derivePartyInviteToken(A, SECRET)).toBe(t);
    expect(derivePartyInviteToken(B, SECRET)).not.toBe(t);
    expect(derivePartyInviteToken(A, 'y'.repeat(40))).not.toBe(t);
  });

  it('fails closed without a real secret', () => {
    expect(() => derivePartyInviteToken(A, '')).toThrow();
    expect(() => derivePartyInviteToken(A, 'short')).toThrow();
  });
});

describe('party invite limits', () => {
  it('does not let iCal guest_count = 1 zero out the cap', () => {
    expect(partyInviteCap(1, undefined)).toBe(10);
    expect(partyInviteCap(1, null)).toBe(10);
  });

  it('honours a bigger booked party and the hard ceiling', () => {
    expect(partyInviteCap(14, 10)).toBe(14);
    expect(partyInviteCap(2, 500)).toBe(30);
    expect(partyInviteCap(2, 0)).toBe(2);
  });

  it('expires at checkout plus grace', () => {
    expect(partyInviteExpiry('2026-10-05T15:00:00.000Z', 12).toISOString()).toBe('2026-10-06T03:00:00.000Z');
    expect(partyInviteExpiry('2026-10-05T15:00:00.000Z', null).toISOString()).toBe('2026-10-06T03:00:00.000Z');
  });
});

describe('host add spots', () => {
  it('never drops below spots already used and never exceeds 30', () => {
    expect(partyInviteCapUpdate(4, 2)).toEqual({ max: 4, full: true });
    expect(partyInviteCapUpdate(4, 8)).toEqual({ max: 8, full: false });
    expect(partyInviteCapUpdate(0, 0)).toEqual({ max: 1, full: false });
    expect(partyInviteCapUpdate(3, 99)).toEqual({ max: 30, full: false });
    expect(partyInviteCapUpdate(10, 10)).toEqual({ max: 10, full: true });
  });
});

describe('party invite URLs', () => {
  const token = 'abcDEF123_-abcDEF123_-abcDEF1234';

  it('keeps the token in the fragment, never the query string', () => {
    const url = new URL(partyJoinUrl('https://moche-ai.com/', 'ocean-view', token));
    expect(url.pathname).toBe('/g/ocean-view/join');
    expect(url.search).toBe('');
    expect(readPartyTokenFromHash(url.hash)).toBe(token);
  });

  it('rejects malformed fragments', () => {
    expect(readPartyTokenFromHash('')).toBeNull();
    expect(readPartyTokenFromHash('#t=short')).toBeNull();
    expect(readPartyTokenFromHash('#t=<script>alert(1)</script>')).toBeNull();
  });

  it('builds a cross-platform sms link', () => {
    expect(smsShareHref('Hi & welcome')).toBe('sms:?&body=Hi%20%26%20welcome');
  });
});
