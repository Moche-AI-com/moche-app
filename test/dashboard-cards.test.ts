import { describe, expect, it } from 'vitest';
import { extrasRequestSummary } from '@/lib/dashboard/scope';
import { roleFor, roleLabel } from '@/lib/dashboard/roles';

describe('extras request status summary', () => {
  it('counts only open rows as needing a response and never invents payment or schedule data', () => {
    expect(
      extrasRequestSummary([
        { status: 'open' },
        { status: 'closed' },
        { status: 'resolved' },
        { status: 'other' },
      ]),
    ).toEqual({ total: 4, needsResponse: 1, resolved: 2 });
  });
});

describe('dashboard role labels', () => {
  it('uses only the Owner, Admin, and Member presets', () => {
    expect(roleLabel({ userId: 'owner', accountOwnerId: 'owner', isAdmin: true })).toBe('Owner');
    expect(roleLabel({ userId: 'admin', accountOwnerId: 'owner', isAdmin: true })).toBe('Admin');
    expect(roleLabel({ userId: 'member', accountOwnerId: 'owner' })).toBe('Member');
    expect(roleFor({ userId: 'member', accountOwnerId: 'owner' })).toBe('member');
  });
});
