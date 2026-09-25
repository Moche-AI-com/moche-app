import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), admin: vi.fn(), enabled: vi.fn(), search: vi.fn(), rate: vi.fn(),
}));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: mocks.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/local/mapbox', () => ({ hasMapbox: mocks.enabled, mapboxSearchPois: mocks.search }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
import { GET } from '@/app/api/guest/[slug]/local/search/route';

const property = { id: 'property-1', slug: 'house', status: 'live', lat: 42.38, lng: -71.24 };
function client(row: typeof property | null = property) {
  const builder = { select() { return builder; }, eq() { return builder; }, is() { return builder; },
    async maybeSingle() { return { data: row, error: null }; } };
  return { from: () => builder } as never;
}
const request = (q = 'coffee') => new Request(`https://example.com/api/guest/house/local/search?q=${encodeURIComponent(q)}`);
const context = { params: Promise.resolve({ slug: 'house' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('LOCAL_LIVE_MAPBOX_ENABLED', 'true');
  mocks.session.mockResolvedValue({ sessionId: 'session-1', propertyId: property.id });
  mocks.admin.mockReturnValue(client());
  mocks.enabled.mockReturnValue(true);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.search.mockResolvedValue([{ key: 'temporary-1', name: 'Coffee', providerCategory: 'cafe', address: 'Main St',
    lat: 42.38, lng: -71.24, distanceMeters: 100, url: 'javascript:alert(1)', phone: 'bad' }]);
});
afterEach(() => vi.unstubAllEnvs());

describe('temporary Mapbox guest search', () => {
  it('is off by default and never reads providers when disabled', async () => {
    vi.stubEnv('LOCAL_LIVE_MAPBOX_ENABLED', 'false');
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('rejects unverified guests and cross-property slugs before Mapbox calls', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.admin.mockReturnValue(client({ ...property, id: 'different-property' }));
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('validates the query and fails closed on rate denial', async () => {
    expect((await GET(request('a'), context)).status).toBe(400);
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await GET(request(), context)).status).toBe(429);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it('returns sanitized, no-store, non-endorsed results without a database write', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual(expect.objectContaining({
      source: 'mapbox_live', ephemeral: true, hostEndorsed: false,
      places: [expect.objectContaining({ key: 'temporary-1', websiteUrl: null, telHref: null })],
    }));
    expect(mocks.rate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failClosed: true }));
  });
  it('degrades safely when the provider fails', async () => {
    mocks.search.mockRejectedValue(new Error('private provider error'));
    const response = await GET(request(), context);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private provider error');
  });
});
