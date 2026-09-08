import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), osm: vi.fn(), geo: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/local/osm', () => ({ fetchNearbyPlaces: mocks.osm }));
vi.mock('@/lib/local/geo', () => ({ geoNearbyPlaces: mocks.geo }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn() } }));
import { refreshNearbyPlaces } from './nearby';

const poi = { placeId: 'node/123', category: 'cafe', name: 'Local Coffee', lat: 0, lng: 0.001, distanceMeters: 111 };
type Call = { table: string; op: string; payload?: unknown; options?: unknown };
function database(failTable?: string) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const call: Call = { table, op: 'select' }; calls.push(call);
      const q = {
        select() { return q; }, eq() { return q; }, in() { return q; }, limit() { return q; }, maybeSingle() { return q; },
        insert(payload: unknown) { call.op = 'insert'; call.payload = payload; return q; },
        upsert(payload: unknown, options: unknown) { call.op = 'upsert'; call.payload = payload; call.options = options; return q; },
        update(payload: unknown) { call.op = 'update'; call.payload = payload; return q; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve({
            data: table === 'places' ? [{ id: 'existing-osm', provider_place_id: 'node/123' }] : [],
            error: failTable === table ? { message: 'private database diagnostic', code: 'XX000' } : null,
          }));
        },
      };
      return q;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.osm.mockResolvedValue([poi]);
  mocks.geo.mockResolvedValue({ provider: 'mapbox', places: [{ ...poi, placeId: 'mapbox/private-result' }] });
});

describe('durable nearby discovery', () => {
  it('uses only OSM, never persists temporary Mapbox results or bypasses review through legacy data', async () => {
    const db = database(); mocks.admin.mockReturnValue(db);
    expect(await refreshNearbyPlaces('property', { lat: 0, lng: 0 })).toMatchObject({ ok: true, found: 1 });
    expect(mocks.osm).toHaveBeenCalled();
    expect(mocks.geo).not.toHaveBeenCalled();
    expect(db.calls.some((c) => c.table === 'nearby_places')).toBe(false);
    expect(db.calls.filter((c) => c.table === 'places' && c.op === 'upsert')).toHaveLength(0);
    const relationship = db.calls.find((c) => c.table === 'property_place_recommendations' && c.op === 'upsert');
    expect(relationship?.payload).toEqual([expect.objectContaining({ property_id: 'property', place_id: 'existing-osm', status: 'suggested' })]);
    expect(relationship?.options).toMatchObject({ ignoreDuplicates: true });
  });
  it.each([{ lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }])('rejects invalid coordinates before requesting a provider', async (coords) => {
    expect(await refreshNearbyPlaces('property', coords)).toMatchObject({ ok: false, skipped: 'no_coords' });
    expect(mocks.osm).not.toHaveBeenCalled(); expect(mocks.geo).not.toHaveBeenCalled();
  });
  it('reports failures without returning private database messages', async () => {
    const db = database('places'); mocks.admin.mockReturnValue(db);
    const result = await refreshNearbyPlaces('property', { lat: 0, lng: 0 });
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toContain('private database diagnostic');
  });
  it('reports provider outages as failures, not an empty successful discovery', async () => {
    mocks.osm.mockRejectedValue(new Error('provider private error'));
    mocks.admin.mockReturnValue(database());
    expect(await refreshNearbyPlaces('property', { lat: 0, lng: 0 })).toMatchObject({ ok: false });
  });
});
