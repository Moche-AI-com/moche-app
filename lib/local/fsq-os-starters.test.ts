import { describe, expect, it } from 'vitest';
import { selectFsqOsStarters, type FsqOsPlaceInput } from './fsq-os-starters';

const base: FsqOsPlaceInput = {
  fsq_place_id: 'fsq-1', name: 'Good coffee', latitude: 42.38, longitude: -71.24,
  address: '12 Main St', locality: 'Waltham', region: 'MA', country: 'US',
  date_refreshed: '2026-09-01', date_closed: null, website: 'https://cafe.example',
  tel: '+1 781 555 0100', fsq_category_ids: ['cafe-id'], unresolved_flags: [],
};
const options = { propertyLat: 42.38, propertyLng: -71.24, snapshotDate: '2026-09-15',
  now: new Date('2026-09-25T12:00:00Z'), categoryById: { 'cafe-id': 'cafe' as const } };

describe('FSQ OS starter selection', () => {
  it('selects a nearby, refreshed, unflagged essential without host endorsement', () => {
    expect(selectFsqOsStarters([base], options)).toEqual([expect.objectContaining({
      source: 'fsq_os', providerId: 'fsq-1', category: 'cafe', distanceMeters: 0,
      hostEndorsed: false, website: 'https://cafe.example/',
    })]);
  });
  it('excludes closed, flagged, stale, unmapped and unlocated records', () => {
    const changes: Partial<FsqOsPlaceInput>[] = [
      { date_closed: '2026-09-01' }, { unresolved_flags: ['closed'] },
      { unresolved_flags: null }, { date_refreshed: '2024-01-01' },
      { fsq_category_ids: ['unknown'] }, { latitude: null }, { name: '' },
    ];
    for (const change of changes) expect(selectFsqOsStarters([{ ...base, ...change }], options)).toEqual([]);
  });
  it('rejects an expired or future catalog snapshot', () => {
    expect(selectFsqOsStarters([base], { ...options, snapshotDate: '2025-01-01' })).toEqual([]);
    expect(selectFsqOsStarters([base], { ...options, snapshotDate: '2026-10-01' })).toEqual([]);
  });
  it('caps each category, enforces distance and deduplicates provider ids', () => {
    const rows = [base, base, { ...base, fsq_place_id: 'fsq-2', latitude: 42.3801 },
      { ...base, fsq_place_id: 'fsq-3', latitude: 42.3802 },
      { ...base, fsq_place_id: 'far', latitude: 43 }];
    expect(selectFsqOsStarters(rows, options).map((row) => row.providerId)).toEqual(['fsq-1', 'fsq-2']);
  });
  it('drops unsafe website and phone values without dropping the place', () => {
    const result = selectFsqOsStarters([{ ...base, website: 'javascript:alert(1)', tel: '+++12' }], options);
    expect(result[0]).toMatchObject({ website: null, phone: null });
  });
});
