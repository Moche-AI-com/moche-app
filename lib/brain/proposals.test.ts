import { describe, it, expect } from 'vitest';
import {
  PROPOSABLE_FIELDS,
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_SOURCE_LABEL,
  proposableField,
  isProposableField,
  normalizeProposedValue,
  isProposalDecision,
  statusForDecision,
  canDecide,
  queueSummary,
  summarizeValue,
  daysBetween,
} from './proposals';
import { TONE_PRESET_IDS } from '@/lib/constants';

describe('field allowlist', () => {
  it('resolves a known field', () => {
    expect(proposableField('properties.city')?.column).toBe('city');
    expect(isProposableField('brain.listing_summary')).toBe(true);
  });

  it('rejects unknown paths', () => {
    expect(proposableField('properties.host_account_id')).toBeNull();
    expect(isProposableField('anything.else')).toBe(false);
  });

  // The whole security model rests on this: a hostile field_path must not
  // resolve through Object.prototype.
  it('rejects prototype keys', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(proposableField(key)).toBeNull();
      expect(isProposableField(key)).toBe(false);
    }
  });

  it('never allows a field that could change ownership or identity', () => {
    for (const path of Object.keys(PROPOSABLE_FIELDS)) {
      expect(path).not.toMatch(/host_account_id|owner|_id$|slug|status|deleted_at/);
    }
  });

  it('every entry carries a column when it targets a table column', () => {
    for (const f of Object.values(PROPOSABLE_FIELDS)) {
      if (f.target === 'brain_items') expect(f.column).toBeUndefined();
      else expect(f.column, f.path).toBeTruthy();
    }
  });

  it('each key matches its own path field and the database shape check', () => {
    for (const [key, f] of Object.entries(PROPOSABLE_FIELDS)) {
      expect(f.path).toBe(key);
      // Mirrors the CHECK constraint in supabase-migrations-PROPOSED-UPDATES.sql.
      expect(key).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
      expect(key.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('normalizeProposedValue — brain_item', () => {
  const field = PROPOSABLE_FIELDS['brain.listing_summary'];
  const body = 'A two bedroom apartment with a balcony and parking on site.';

  it('accepts a well formed entry and trims it', () => {
    const r = normalizeProposedValue(field, { title: '  Listing  ', text: `  ${body}  `, category: 'core' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        title: 'Listing',
        text: body,
        category: 'core',
        visibility: 'guest',
        sourceUrl: null,
        // Routing fields (2026-08-28): present on every normalized value, null when
        // the draft made no routing claim.
        section: null,
        featureId: null,
        replacesItemId: null,
      });
    }
  });

  it('defaults an unknown category to product_urls rather than failing', () => {
    const r = normalizeProposedValue(field, { title: 'T', text: body, category: 'nope' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { category: string }).category).toBe('product_urls');
  });

  it('defaults visibility to guest and only honours an explicit internal', () => {
    const guest = normalizeProposedValue(field, { title: 'T', text: body, visibility: 'weird' });
    const internal = normalizeProposedValue(field, { title: 'T', text: body, visibility: 'internal' });
    if (guest.ok) expect((guest.value as { visibility: string }).visibility).toBe('guest');
    if (internal.ok) expect((internal.value as { visibility: string }).visibility).toBe('internal');
  });

  it('rejects a missing title', () => {
    const r = normalizeProposedValue(field, { title: '   ', text: body });
    expect(r).toEqual({ ok: false, error: 'Give this entry a title.' });
  });

  it('rejects content too short to be useful', () => {
    const r = normalizeProposedValue(field, { title: 'T', text: 'too short' });
    expect(r.ok).toBe(false);
  });

  it('rejects content beyond the storage ceiling', () => {
    const r = normalizeProposedValue(field, { title: 'T', text: 'x'.repeat(20001) });
    expect(r.ok).toBe(false);
  });

  it('rejects non-objects, arrays and null', () => {
    for (const bad of ['a string', 42, null, [], undefined]) {
      expect(normalizeProposedValue(field, bad).ok).toBe(false);
    }
  });

  it('drops an over-long source url instead of storing it', () => {
    const r = normalizeProposedValue(field, { title: 'T', text: body, sourceUrl: `https://x.com/${'a'.repeat(2100)}` });
    if (r.ok) expect((r.value as { sourceUrl: string | null }).sourceUrl).toBeNull();
  });
});

// 2026-08-28: updates carry their destination — a canonical section, optionally a
// custom feature, and an add-vs-replace decision made at draft time. All three are
// validated here so a misroute is a loud review error, never a silent misfile.
describe('normalizeProposedValue — routing fields', () => {
  const field = PROPOSABLE_FIELDS['brain.listing_summary'];
  const body = 'A two bedroom apartment with a balcony and parking on site.';

  it('carries a canonical section and derives the storage bucket from it', () => {
    const r = normalizeProposedValue(field, { title: 'T', text: body, category: 'core', section: 'connectivity' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { section: string | null; category: string };
      expect(v.section).toBe('connectivity');
      // The bucket follows the section, not the model's free choice — the two can
      // never disagree.
      expect(v.category).toBe('core');
    }
  });

  it('rejects a section the taxonomy does not know', () => {
    const r = normalizeProposedValue(field, { title: 'T', text: body, section: 'attic' });
    expect(r).toEqual({ ok: false, error: 'That section is not one this Brain has.' });
  });

  it('rejects a malformed feature or replacement target', () => {
    expect(normalizeProposedValue(field, { title: 'T', text: body, featureId: 'not-a-uuid' }).ok).toBe(false);
    expect(normalizeProposedValue(field, { title: 'T', text: body, replacesItemId: 'nope' }).ok).toBe(false);
  });

  it('a feature target implies the amenities section and its storage bucket', () => {
    const r = normalizeProposedValue(field, {
      title: 'T',
      text: body,
      featureId: '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { section: string | null; featureId: string | null; category: string };
      expect(v.featureId).toBe('123e4567-e89b-42d3-a456-426614174000');
      expect(v.section).toBe('amenities');
      expect(v.category).toBe('appliances');
    }
  });

  it('carries a replacement target through unchanged', () => {
    const r = normalizeProposedValue(field, {
      title: 'T',
      text: body,
      replacesItemId: '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { replacesItemId: string | null }).replacesItemId).toBe(
        '123e4567-e89b-42d3-a456-426614174000',
      );
    }
  });
});

describe('normalizeProposedValue — text', () => {
  const city = PROPOSABLE_FIELDS['properties.city'];

  it('trims and accepts', () => {
    expect(normalizeProposedValue(city, '  Lisbon ')).toEqual({ ok: true, value: 'Lisbon' });
  });

  it('rejects empty and whitespace-only', () => {
    expect(normalizeProposedValue(city, '').ok).toBe(false);
    expect(normalizeProposedValue(city, '   ').ok).toBe(false);
  });

  it('enforces the per-field ceiling', () => {
    expect(normalizeProposedValue(city, 'x'.repeat(121)).ok).toBe(false);
    expect(normalizeProposedValue(city, 'x'.repeat(120)).ok).toBe(true);
    const postal = PROPOSABLE_FIELDS['properties.postal_code'];
    expect(normalizeProposedValue(postal, 'x'.repeat(33)).ok).toBe(false);
  });

  it('rejects non-strings', () => {
    for (const bad of [{}, 5, true, null]) expect(normalizeProposedValue(city, bad).ok).toBe(false);
  });
});

describe('normalizeProposedValue — tone_preset', () => {
  const tone = PROPOSABLE_FIELDS['property_settings.concierge_tone'];

  it('accepts every real preset id', () => {
    for (const id of TONE_PRESET_IDS) {
      expect(normalizeProposedValue(tone, id)).toEqual({ ok: true, value: id });
    }
  });

  it('rejects freeform prose, which is exactly what the migration is escaping', () => {
    const r = normalizeProposedValue(tone, 'Be warm and a bit funny please');
    expect(r).toEqual({ ok: false, error: 'Pick one of the available tones.' });
  });
});

describe('decisions', () => {
  it('recognises the three decisions and nothing else', () => {
    expect(isProposalDecision('approve')).toBe(true);
    expect(isProposalDecision('modify')).toBe(true);
    expect(isProposalDecision('deny')).toBe(true);
    for (const bad of ['delete', '', 'APPROVE', null, 7]) expect(isProposalDecision(bad)).toBe(false);
  });

  it('maps decisions to statuses', () => {
    expect(statusForDecision('approve')).toBe('approved');
    expect(statusForDecision('modify')).toBe('modified');
    expect(statusForDecision('deny')).toBe('denied');
  });

  it('only pending rows are decidable', () => {
    expect(canDecide('pending')).toBe(true);
    for (const s of ['approved', 'modified', 'denied'] as const) expect(canDecide(s)).toBe(false);
  });

  it('labels every status and source', () => {
    expect(Object.keys(PROPOSAL_STATUS_LABEL)).toHaveLength(4);
    for (const v of Object.values(PROPOSAL_STATUS_LABEL)) expect(v.length).toBeGreaterThan(0);
    for (const v of Object.values(PROPOSAL_SOURCE_LABEL)) expect(v.length).toBeGreaterThan(0);
  });

  // Guest-facing vocabulary rule from the product brief.
  it('no label uses the forbidden word', () => {
    const all = [...Object.values(PROPOSAL_STATUS_LABEL), ...Object.values(PROPOSAL_SOURCE_LABEL)].join(' ');
    expect(all.toLowerCase()).not.toContain('upsell');
  });
});

describe('queueSummary', () => {
  const now = new Date('2026-03-10T12:00:00Z');

  it('reports an empty queue', () => {
    const s = queueSummary([], now);
    expect(s.pending).toBe(0);
    expect(s.oldestPendingDays).toBeNull();
    expect(s.detail).toContain('Nothing waiting');
  });

  it('ignores settled rows', () => {
    const s = queueSummary(
      [
        { status: 'approved', created_at: '2026-01-01T00:00:00Z' },
        { status: 'denied', created_at: '2026-01-01T00:00:00Z' },
        { status: 'modified', created_at: '2026-01-01T00:00:00Z' },
      ],
      now,
    );
    expect(s.pending).toBe(0);
  });

  it('counts pending and finds the oldest', () => {
    const s = queueSummary(
      [
        { status: 'pending', created_at: '2026-03-08T12:00:00Z' },
        { status: 'pending', created_at: '2026-03-01T12:00:00Z' },
        { status: 'approved', created_at: '2026-01-01T00:00:00Z' },
      ],
      now,
    );
    expect(s.pending).toBe(2);
    expect(s.oldestPendingDays).toBe(9);
    expect(s.detail).toBe('2 suggestions to approve. Oldest arrived 9 days ago.');
  });

  it('uses singular phrasing for one row and "today" for a fresh one', () => {
    const s = queueSummary([{ status: 'pending', created_at: '2026-03-10T09:00:00Z' }], now);
    expect(s.detail).toBe('1 suggestion to approve. Oldest arrived today.');
  });

  it('says "1 day ago" rather than "1 days ago"', () => {
    const s = queueSummary([{ status: 'pending', created_at: '2026-03-09T09:00:00Z' }], now);
    expect(s.detail).toContain('1 day ago');
  });

  it('never reports a negative age for a clock-skewed future row', () => {
    expect(daysBetween('2026-03-20T00:00:00Z', now)).toBe(0);
  });

  it('survives an unparseable timestamp', () => {
    expect(daysBetween('not-a-date', now)).toBe(0);
  });
});

describe('summarizeValue', () => {
  it('handles nullish, scalars and objects', () => {
    expect(summarizeValue(null)).toBe('Not set');
    expect(summarizeValue(undefined)).toBe('Not set');
    expect(summarizeValue(42)).toBe('42');
    expect(summarizeValue(true)).toBe('true');
    expect(summarizeValue('Lisbon')).toBe('Lisbon');
  });

  it('prefers the text field of a brain item payload', () => {
    expect(summarizeValue({ title: 'T', text: 'The balcony faces west.' })).toBe('The balcony faces west.');
  });

  it('collapses whitespace and truncates with an ellipsis', () => {
    const out = summarizeValue('a\n\n   b '.repeat(60), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(out).not.toContain('\n');
  });

  it('falls back to JSON for other shapes', () => {
    expect(summarizeValue([1, 2])).toBe('[1,2]');
  });
});
