import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(), user: vi.fn(), admin: vi.fn(), rate: vi.fn(),
  search: vi.fn(), hasMapbox: vi.fn(), session: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/auth/guards', () => ({ getPropertyAccess: mocks.access, requirePropertyAccess: mocks.access, getUser: mocks.user }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: mocks.session }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/local/mapbox', () => ({ hasMapbox: mocks.hasMapbox, mapboxSearchPois: mocks.search }));
vi.mock('@/lib/local/nearby', () => ({ refreshNearbyPlaces: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/posthog-server', () => ({ capture: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { loadCanonicalPlaces, loadGuestLocalPlaces } from '@/lib/local/canonical';
import { GET as searchRoute } from '@/app/api/host/properties/[id]/local/search/route';
import { GET as detailRoute } from '@/app/api/guest/[slug]/places/[id]/route';
import { addManualLocalPlaceAction, updateLocalPlaceAction } from '@/app/dashboard/properties/[id]/local/actions';

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const REC = '22222222-2222-4222-8222-222222222222';
const place = { id: REC, place_id: 'shared-place', property_id: PROPERTY, status: 'approved', host_note: 'Breakfast', tags: [], intent_tags: [], is_favorite: false, distance_miles: 1, places: { name: 'New Coffee', category: 'cafe', address: '1 Main', provider: 'manual', last_refreshed_at: '2026-01-01', lat: 0, lon: 0, website: null, phone: null } };
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
function db(rows: Record<string, unknown[]>, failure?: string) {
  const calls: Call[] = [];
  const client = { from(table: string) {
    const call: Call = { table, op: 'select', filters: [] }; calls.push(call);
    let single = false;
    const builder = {
      select() { return builder; }, order() { return builder; }, limit() { return builder; }, range() { return builder; },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
      neq(key: string, value: unknown) { call.filters.push([`!${key}`, value]); return builder; },
      is(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
      insert(payload: unknown) { call.op = 'insert'; call.payload = payload; return builder; },
      upsert(payload: unknown) { call.op = 'upsert'; call.payload = payload; return builder; },
      update(payload: unknown) { call.op = 'update'; call.payload = payload; return builder; },
      maybeSingle() { single = true; return builder; }, single() { single = true; return builder; },
      then(resolve: (value: unknown) => unknown) {
        const selected = (rows[table] ?? []).filter((row) => call.filters.every(([key, value]) => {
          const r = row as Record<string, unknown>;
          return key.startsWith('!') ? r[key.slice(1)] !== value : r[key] === value;
        }));
        const data = call.op === 'insert' ? { id: 'new-place' } : single ? selected[0] ?? null : selected;
        return Promise.resolve(resolve({ data, error: failure === table ? { message: 'database unavailable', code: 'XX000' } : null }));
      },
    };
    return builder;
  } };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ propertyId: PROPERTY, name: 'New Coffee', category: 'cafe', status: 'approved', ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ isOwner: true, property: { id: PROPERTY, host_account_id: 'account', lat: 0, lng: 0 }, can: { editBrain: true } });
  mocks.user.mockResolvedValue({ id: 'host' });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.hasMapbox.mockReturnValue(false);
  mocks.session.mockResolvedValue({ propertyId: PROPERTY });
});

describe('canonical host and guest visibility', () => {
  it('retains hidden rows for the host to unhide', async () => {
    const { client } = db({ property_place_recommendations: [{ ...place, status: 'hidden' }] });
    expect(await loadCanonicalPlaces(client, PROPERTY, [], { includeHidden: true })).toHaveLength(1);
  });
  it.each(['hidden', 'suggested'])('never resurrects legacy places when canonical status is %s', async (status) => {
    const { client, calls } = db({ property_place_recommendations: [{ ...place, status }] });
    expect(await loadGuestLocalPlaces(client, PROPERTY)).toEqual([]);
    expect(calls.some((c) => c.table === 'nearby_places')).toBe(false);
  });
  it('fails closed instead of reading stale legacy data on canonical database errors', async () => {
    const { client } = db({}, 'property_place_recommendations');
    await expect(loadGuestLocalPlaces(client, PROPERTY)).rejects.toBeTruthy();
  });
  it('does not disclose host-only legacy recommendations', async () => {
    const { client } = db({ recommendations: [{
      id: 'private-legacy', property_id: PROPERTY, name: 'Host private place', category: 'cafe',
      hidden: false, approved: true, deleted_at: null, visibility: 'internal',
    }] });
    expect(await loadGuestLocalPlaces(client, PROPERTY)).toEqual([]);
  });
  it('keeps the legacy host-entered address and website for guest directions', async () => {
    const { client } = db({ recommendations: [{
      id: 'public-legacy', property_id: PROPERTY, name: 'Host public place', category: 'cafe',
      hidden: false, approved: true, deleted_at: null, visibility: 'guest',
      address: '8 Main Street', url: 'https://cafe.example/', lat: 0, lng: 0,
    }] });
    expect(await loadGuestLocalPlaces(client, PROPERTY)).toEqual([expect.objectContaining({
      address: '8 Main Street', website: 'https://cafe.example/', lat: 0, lng: 0,
    })]);
  });
});

describe('property-scoped canonical search', () => {
  it('finds a newly saved canonical place and returns coordinates for map selection', async () => {
    const { client, calls } = db({ property_place_recommendations: [place] }); mocks.admin.mockReturnValue(client);
    const response = await searchRoute(new Request('https://example.com?q=coffee'), { params: Promise.resolve({ id: PROPERTY }) });
    expect((await response.json()).results).toEqual(expect.arrayContaining([expect.objectContaining({ id: REC, lat: 0, lng: 0, inLibrary: true })]));
    expect(calls.filter((c) => c.table === 'property_place_recommendations')[0].filters).toContainEqual(['property_id', PROPERTY]);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it.each([null, { can: { editBrain: false }, isOwner: false }])('denies non-members/unassigned or read-only members before reading data', async (access) => {
    mocks.access.mockResolvedValue(access);
    const response = await searchRoute(new Request('https://example.com?q=coffee'), { params: Promise.resolve({ id: PROPERTY }) });
    expect([403, 404]).toContain(response.status);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});

describe('safe host saves', () => {
  it('returns a validation error without any write for invalid coordinates', async () => {
    const { client, calls } = db({}); mocks.admin.mockReturnValue(client);
    expect(await addManualLocalPlaceAction({}, form({ lat: '91', lng: '0' }))).toHaveProperty('error');
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });
  it('denies a missing property membership without writes', async () => {
    mocks.access.mockResolvedValue(null);
    expect(await addManualLocalPlaceAction({}, form())).toHaveProperty('error');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not reuse a matching manual record from another property', async () => {
    const { client, calls } = db({ places: [{ id: 'other-account-place', provider: 'manual', name: 'New Coffee', normalized_name: 'new coffee', category: 'cafe', address: null }] });
    mocks.admin.mockReturnValue(client);
    expect(await addManualLocalPlaceAction({}, form())).toMatchObject({ ok: true });
    expect(calls.find((c) => c.table === 'places' && c.op === 'insert')).toBeTruthy();
    expect(calls.find((c) => c.table === 'property_place_recommendations' && c.op === 'insert')?.payload).toMatchObject({ property_id: PROPERTY, place_id: 'new-place' });
  });
  it('rejects a recommendation from another property before any place mutation', async () => {
    const { client, calls } = db({ property_place_recommendations: [{ ...place, property_id: 'other-property' }] }); mocks.admin.mockReturnValue(client);
    expect(await updateLocalPlaceAction({}, form({ recommendationId: REC }))).toHaveProperty('error');
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });
  it('edits details by copying, never changing a shared place used by another property', async () => {
    const { client, calls } = db({ property_place_recommendations: [place] }); mocks.admin.mockReturnValue(client);
    expect(await updateLocalPlaceAction({}, form({ recommendationId: REC, name: 'Host corrected name' }))).toMatchObject({ ok: true });
    expect(calls.some((c) => c.table === 'places' && c.op === 'update')).toBe(false);
    const update = calls.find((c) => c.table === 'property_place_recommendations' && c.op === 'update');
    expect(update?.filters).toContainEqual(['id', REC]);
    expect(update?.filters).toContainEqual(['property_id', PROPERTY]);
    expect(update?.payload).toMatchObject({ place_id: 'new-place' });
  });
});

describe('guest place details', () => {
  it.each(['hidden', 'suggested'])('does not disclose %s recommendations', async (status) => {
    const { client } = db({ properties: [{ id: PROPERTY, slug: 'house', status: 'live', deleted_at: null }], property_place_recommendations: [{ ...place, status }] }); mocks.admin.mockReturnValue(client);
    const response = await detailRoute(new Request('https://example.com'), { params: Promise.resolve({ slug: 'house', id: REC }) });
    expect(response.status).toBe(404);
  });
  it('denies a recommendation belonging to another property', async () => {
    const { client } = db({ properties: [{ id: PROPERTY, slug: 'house', status: 'live', deleted_at: null }], property_place_recommendations: [{ ...place, property_id: 'other-property' }] }); mocks.admin.mockReturnValue(client);
    expect((await detailRoute(new Request('https://example.com'), { params: Promise.resolve({ slug: 'house', id: REC }) })).status).toBe(404);
  });
});
