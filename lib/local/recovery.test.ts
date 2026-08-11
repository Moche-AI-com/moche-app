import { describe, expect, it } from 'vitest';
import { searchWithRecovery, type ProviderPlace, type RecoveryProviders } from './recovery';

const hit: ProviderPlace = {
  id: '1', provider: 'osm', providerPlaceId: 'osm:1', name: 'Cedar Cafe',
  category: 'cafe', address: null, lat: 0, lon: 0, distanceMeters: 50,
};

function providers(mapbox: ProviderPlace[][], osm: ProviderPlace[][]): RecoveryProviders {
  return {
    mapbox: async () => mapbox.shift() ?? [],
    osm: async () => osm.shift() ?? [],
  };
}

describe('local search recovery', () => {
  it.each([
    ['exact_match', providers([[hit]], [])],
    ['category_retry', providers([[], [hit]], [])],
    ['wider_radius', providers([[], [], [hit]], [])],
    ['osm_fallback', providers([[], [], []], [[hit]])],
  ] as const)('reports the successful %s rung', async (step, fakeProviders) => {
    await expect(searchWithRecovery('cedar', 'cafe', fakeProviders)).resolves.toMatchObject({ step, results: [hit] });
  });

  it('filters prefix matches and labels that final provider rung correctly', async () => {
    const nonMatch = { ...hit, id: 'no', name: 'Maple Bakery', category: 'bakery' };
    const result = await searchWithRecovery(
      'ced ca',
      'cafe',
      providers([[], [], []], [[], [nonMatch, hit]]),
    );
    expect(result.step).toBe('prefix_match');
    expect(result.results).toEqual([hit]);
  });

  it('always ends with an actionable manual state', async () => {
    const result = await searchWithRecovery('nothing', null, providers([[], [], []], [[], []]));
    expect(result).toEqual({
      results: [],
      step: 'manual',
      browseCategory: 'restaurant',
      manualAvailable: true,
    });
  });
});
