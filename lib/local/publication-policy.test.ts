import { describe, expect, it } from 'vitest';
import { evaluateDiscoveryPublication, type DiscoveryCandidate } from './publication-policy';

const candidate: DiscoveryCandidate = {
  source: 'osm', name: 'Neighborhood grocery', category: 'grocery',
  lat: 42.38, lon: -71.24, verifiedAt: new Date('2026-09-24T00:00:00Z'),
  sourceRightsVerified: true, eligibleCategory: true,
};
const options = { enabled: true, now: new Date('2026-09-25T00:00:00Z') };

describe('evaluateDiscoveryPublication', () => {
  it('fails closed until explicitly enabled', () => {
    expect(evaluateDiscoveryPublication(candidate, { ...options, enabled: false }).status).toBe('suggested');
  });
  it('never auto-publishes temporary Mapbox Search Box results', () => {
    expect(evaluateDiscoveryPublication({ ...candidate, source: 'mapbox_searchbox' }, options))
      .toMatchObject({ status: 'suggested', reason: 'temporary_source' });
  });
  it('requires verified source rights and eligible category', () => {
    expect(evaluateDiscoveryPublication({ ...candidate, sourceRightsVerified: false }, options).status).toBe('suggested');
    expect(evaluateDiscoveryPublication({ ...candidate, eligibleCategory: false }, options).status).toBe('suggested');
  });
  it('rejects invalid, closed, stale and future-dated places', () => {
    expect(evaluateDiscoveryPublication({ ...candidate, lat: 91 }, options).status).toBe('suggested');
    expect(evaluateDiscoveryPublication({ ...candidate, knownClosed: true }, options).status).toBe('suggested');
    expect(evaluateDiscoveryPublication({ ...candidate, verifiedAt: new Date('2026-08-01T00:00:00Z') }, options).status).toBe('suggested');
    expect(evaluateDiscoveryPublication({ ...candidate, verifiedAt: new Date('2026-09-26T00:00:00Z') }, options).status).toBe('suggested');
  });
  it('publishes an eligible discovered essential without inventing host endorsement', () => {
    expect(evaluateDiscoveryPublication(candidate, options))
      .toEqual({ status: 'approved', reason: 'eligible', hostEndorsed: false });
  });
});
