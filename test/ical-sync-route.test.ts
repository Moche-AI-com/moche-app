import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagingDb } from './helpers/messaging-db';

const mocks = vi.hoisted(() => ({ db: null as any, fetchFeed: vi.fn(), sync: vi.fn() }));
vi.mock('@/lib/env', () => ({ serverEnv: { cronSecret: 'synthetic-cron' }, publicEnv: { appUrl: 'https://example.test' } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.db }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/stays/ical-sync', () => ({ fetchIcalFeed: mocks.fetchFeed, syncPropertyIcalFeed: mocks.sync }));
import { GET, POST } from '@/app/api/cron/ical-sync/route';

const req = (auth?: string) => new Request('https://example.test/api/cron/ical-sync', {
  method: 'POST',
  headers: auth ? { authorization: auth } : {},
});
const prop = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, slug: id, host_account_id: 'acct', ical_import_url: `https://cal.example/${id}.ics`,
  ical_last_synced_at: null, deleted_at: null, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchFeed.mockResolvedValue('BEGIN:VCALENDAR');
  mocks.sync.mockResolvedValue({ created: 1, updated: 0, revoked: 0, skipped: 0, mintFailures: 0 });
});

describe('/api/cron/ical-sync', () => {
  it('returns 404 without the shared secret and touches nothing', async () => {
    mocks.db = messagingDb({ properties: [prop('p1')] });
    expect((await POST(req())).status).toBe(404);
    expect((await GET(req('Bearer wrong'))).status).toBe(404);
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });

  it('syncs every live property that has a calendar URL', async () => {
    mocks.db = messagingDb({ properties: [
      prop('p1'), prop('p2'), prop('p3', { ical_import_url: null }), prop('p4', { deleted_at: '2026-09-01T00:00:00Z' }),
    ] });
    const res = await POST(req('Bearer synthetic-cron'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, properties: 2, created: 2, failures: 0 });
    expect(mocks.sync).toHaveBeenCalledWith(mocks.db, { id: 'p1', slug: 'p1', host_account_id: 'acct' }, 'BEGIN:VCALENDAR');
    expect(mocks.fetchFeed).not.toHaveBeenCalledWith('https://cal.example/p4.ics');
  });

  it('keeps going when one feed fails', async () => {
    mocks.db = messagingDb({ properties: [prop('p1'), prop('p2')] });
    mocks.fetchFeed.mockRejectedValueOnce(new Error('Calendar fetch failed (500).'));
    const res = await POST(req('Bearer synthetic-cron'));
    expect(await res.json()).toMatchObject({ ok: true, properties: 2, created: 1, failures: 1 });
  });

  it('returns 500 when the property query fails', async () => {
    mocks.db = messagingDb({}, { properties: 'synthetic failure' });
    expect((await POST(req('Bearer synthetic-cron'))).status).toBe(500);
  });
});
