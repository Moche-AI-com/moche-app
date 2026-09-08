import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapboxSearchPois } from './mapbox';
import { mapboxPublicToken } from './static-map';
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), info: vi.fn() } }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Mapbox transient place search', () => {
  it('limits search to local POIs and keeps data out of request caches', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-token');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }); vi.stubGlobal('fetch', fetcher);
    await mapboxSearchPois({ query: 'coffee', lat: 40, lng: -74, limit: 100 });
    const [url, options] = fetcher.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/search/searchbox/v1/forward');
    expect(parsed.searchParams.get('types')).toBe('poi');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.get('proximity')).toBe('-74,40');
    expect(parsed.searchParams.get('bbox')).toBeTruthy();
    expect(options.cache).toBe('no-store');
  });
  it('does not treat a provider outage as an empty successful search', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(mapboxSearchPois({ query: 'coffee', lat: 40, lng: -74 })).rejects.toThrow('Map suggestions are unavailable');
  });
  it('drops nonfinite, out-of-range and distant provider coordinates', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'server-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      features: [NaN, 91, 20].map((lat) => ({ properties: { name: 'Bad location', coordinates: { latitude: lat, longitude: -74 } } })),
    }) }));
    expect(await mapboxSearchPois({ query: 'coffee', lat: 40, lng: -74 })).toEqual([]);
  });
  it('refuses secret tokens accidentally placed in the public map variable', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'sk.secret');
    expect(mapboxPublicToken()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.public');
    expect(mapboxPublicToken()).toBe('pk.public');
  });
});
