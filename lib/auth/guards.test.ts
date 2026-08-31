import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionContext } from './guards';

// requireFounder is a pure function over plain objects -- tested directly,
// no module mocking needed. redirect() is mocked to throw a recognizable
// marker so we can assert it fired instead of letting Next.js's real
// NEXT_REDIRECT throw escape uncaught.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// The installed `react` package (18.3.1) does not export `cache` -- Next.js
// only makes it available via its own bundled React fork at build time.
// Stub it as a plain pass-through so guards.ts's cache() wrapping is a no-op
// under vitest; each test already gets a fresh module instance via
// vi.resetModules(), so no memoization-pollution risk from this.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

function fakeSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    user: { id: 'user-1' } as SessionContext['user'],
    profile: { id: 'user-1', is_admin: false } as SessionContext['profile'],
    account: { id: 'acct-1', owner_id: 'user-1' } as SessionContext['account'],
    isFounder: false,
    ...overrides,
  };
}

describe('requireFounder', () => {
  it('returns the context unchanged when isFounder is true', async () => {
    const { requireFounder } = await import('./guards');
    const ctx = fakeSessionContext({ isFounder: true });
    expect(requireFounder(ctx)).toBe(ctx);
  });

  it('redirects to /dashboard when isFounder is false', async () => {
    const { requireFounder } = await import('./guards');
    const ctx = fakeSessionContext({ isFounder: false });
    expect(() => requireFounder(ctx)).toThrow('REDIRECT:/dashboard');
  });

  it('redirects to /dashboard when context is null', async () => {
    const { requireFounder } = await import('./guards');
    expect(() => requireFounder(null)).toThrow('REDIRECT:/dashboard');
  });
});

// --- getPropertyAccess cross-property isolation -----------------------------
// Fake Supabase query builder: filters an in-memory fixture array through
// chained .eq()/.is() calls the same way the real PostgREST client narrows
// rows, so getPropertyAccess's actual filter/branch logic is exercised.
function makeQueryBuilder<T extends Record<string, unknown>>(rows: T[]) {
  let filtered = [...rows];
  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    is(col: string, val: unknown) {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    limit(n: number) {
      filtered = filtered.slice(0, n);
      return builder;
    },
    single() {
      const row = filtered[0] ?? null;
      return Promise.resolve({ data: row, error: row ? null : { message: 'no rows' } });
    },
    maybeSingle() {
      return Promise.resolve({ data: filtered[0] ?? null, error: null });
    },
  };
  return builder;
}

interface Fixtures {
  profiles: Array<{ id: string; is_admin: boolean }>;
  host_accounts: Array<{ id: string; owner_id: string; deleted_at: string | null }>;
  properties: Array<{ id: string; host_account_id: string; deleted_at: string | null }>;
  property_members: Array<Record<string, unknown>>;
}

function fakeSupabase(fixtures: Fixtures, authUserId: string | null) {
  const tables: Record<string, unknown[]> = { ...fixtures };
  return {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: authUserId ? { id: authUserId } : null } }),
    },
    from(table: string) {
      return makeQueryBuilder((tables[table] ?? []) as Record<string, unknown>[]);
    },
  };
}

describe('getPropertyAccess cross-property isolation', () => {
  const USER = 'pm-user';
  const OWNER = 'owner-user';
  const PROP_A = 'property-a';
  const PROP_B = 'property-b';

  const fixtures: Fixtures = {
    profiles: [{ id: USER, is_admin: false }],
    host_accounts: [{ id: 'acct-owner', owner_id: OWNER, deleted_at: null }],
    properties: [
      { id: PROP_A, host_account_id: 'acct-owner', deleted_at: null },
      { id: PROP_B, host_account_id: 'acct-owner', deleted_at: null },
    ],
    property_members: [
      {
        id: 'member-1',
        property_id: PROP_A,
        profile_id: USER,
        role: 'property_manager',
        can_edit_brain: true,
        can_reply_guests: true,
        can_receive_escalations: true,
        can_resolve_maintenance: true,
        can_view_analytics: true,
      },
      // Deliberately no property_members row for (PROP_B, USER).
    ],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () => fakeSupabase(fixtures, USER),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('grants full capabilities as a property_manager on Property A', async () => {
    const { getPropertyAccess } = await import('./guards');
    const access = await getPropertyAccess(PROP_A);
    expect(access).not.toBeNull();
    expect(access!.isOwner).toBe(false);
    expect(access!.member?.role).toBe('property_manager');
    expect(access!.can).toEqual({
      editBrain: true,
      replyGuests: true,
      receiveEscalations: true,
      resolveMaintenance: true,
      viewAnalytics: true,
      editProperty: false,
      manageBilling: false,
      manageCoHosts: false,
    });
  });

  it('denies every capability on Property B, where the property_manager has no membership row', async () => {
    const { getPropertyAccess } = await import('./guards');
    const access = await getPropertyAccess(PROP_B);
    expect(access).not.toBeNull(); // property row exists, but access must still be denied
    expect(access!.isOwner).toBe(false);
    expect(access!.member).toBeNull();
    expect(access!.can).toEqual({
      editBrain: false,
      replyGuests: false,
      receiveEscalations: false,
      resolveMaintenance: false,
      viewAnalytics: false,
      editProperty: false,
      manageBilling: false,
      manageCoHosts: false,
    });
  });
});

// The pre-launch flag is the single switch the guest side hangs off (see the note
// on requireLaunchAccess): a property cannot be set `live` while it is true, and
// every guest surface requires `live`. Tested against explicit dates rather than
// the real clock so these assertions do not silently invert on launch day.
describe('isPreLaunch', () => {
  it('is true before the launch date', async () => {
    const { isPreLaunch } = await import('./guards');
    expect(isPreLaunch(new Date('2026-12-31T23:59:59.000Z'))).toBe(true);
  });

  it('is false at the launch instant and after', async () => {
    const { isPreLaunch, LAUNCH_GATE_CUTOFF_ISO } = await import('./guards');
    const { LAUNCH_DATE_ISO } = await import('@/lib/constants');
    expect(isPreLaunch(new Date(LAUNCH_DATE_ISO))).toBe(false);
    expect(isPreLaunch(new Date('2027-06-01T00:00:00.000Z'))).toBe(false);
    // The old signup cutoff is unrelated to launch and must not be mistaken for it.
    expect(LAUNCH_GATE_CUTOFF_ISO).not.toBe(LAUNCH_DATE_ISO);
  });
});
