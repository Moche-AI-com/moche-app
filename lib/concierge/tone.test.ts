import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESTRICTED_TOPIC_KEYS,
  DEFAULT_TONE_PRESET_ID,
  RESTRICTED_TOPIC_OPTIONS,
  TONE_PRESETS,
} from '@/lib/constants';

import {
  buildRestrictedTopicsClause,
  hasPendingLegacyTone,
  isTonePresetId,
  normalizeRestrictedTopicKeys,
  resolveRestrictedTopicKeys,
  resolveTonePrompt,
  restrictedTopicLabels,
  suggestTonePreset,
  tonePresetFor,
} from './tone';

describe('TONE_PRESETS shape', () => {
  it('has exactly the five presets the plan specifies', () => {
    expect(TONE_PRESETS.map((p) => p.id)).toEqual([
      'friendly',
      'professional',
      'luxury_concierge',
      'casual',
      'family_friendly',
    ]);
  });

  it('gives every preset a non-empty label, description, and prompt fragment', () => {
    for (const p of TONE_PRESETS) {
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.description.trim().length).toBeGreaterThan(0);
      expect(p.promptFragment.trim().length).toBeGreaterThan(0);
    }
  });

  it('has unique IDs and unique prompt fragments', () => {
    expect(new Set(TONE_PRESETS.map((p) => p.id)).size).toBe(TONE_PRESETS.length);
    expect(new Set(TONE_PRESETS.map((p) => p.promptFragment)).size).toBe(TONE_PRESETS.length);
  });

  it('exposes a default that is itself a real preset', () => {
    expect(isTonePresetId(DEFAULT_TONE_PRESET_ID)).toBe(true);
  });
});

describe('isTonePresetId', () => {
  it('accepts every shipped preset ID', () => {
    for (const p of TONE_PRESETS) expect(isTonePresetId(p.id)).toBe(true);
  });

  it('rejects prose, near-misses, and non-strings', () => {
    for (const bad of [
      'Warm and friendly',
      'warm_professional', // the real pre-migration value in production
      'FRIENDLY',
      ' friendly ',
      '',
      null,
      undefined,
      42,
      ['friendly'],
    ]) {
      expect(isTonePresetId(bad)).toBe(false);
    }
  });
});

describe('tonePresetFor', () => {
  it('resolves a known ID', () => {
    expect(tonePresetFor('luxury_concierge').label).toBe('Luxury concierge');
  });

  it('falls back to the default for unknown, empty, and missing values', () => {
    for (const bad of ['nope', '', null, undefined]) {
      expect(tonePresetFor(bad).id).toBe(DEFAULT_TONE_PRESET_ID);
    }
  });
});

describe('legacy tone handover', () => {
  const NOTE = 'Warm, welcoming, and local but with a surfer dude personality.';

  it('treats an un-acknowledged note as pending', () => {
    expect(hasPendingLegacyTone({ legacyToneNote: NOTE })).toBe(true);
  });

  it('does not treat a blank or whitespace-only note as pending', () => {
    expect(hasPendingLegacyTone({ legacyToneNote: '' })).toBe(false);
    expect(hasPendingLegacyTone({ legacyToneNote: '   \n ' })).toBe(false);
    expect(hasPendingLegacyTone({})).toBe(false);
  });

  it('stops being pending once acknowledged', () => {
    expect(
      hasPendingLegacyTone({ legacyToneNote: NOTE, legacyToneAckAt: '2026-08-05T00:00:00Z' }),
    ).toBe(false);
  });

  // The core P4-07 guarantee: a live concierge's voice does not change until the
  // host has answered.
  it('keeps a pending legacy note in force, ignoring the preset', () => {
    expect(resolveTonePrompt({ conciergeTone: 'professional', legacyToneNote: NOTE })).toBe(NOTE);
  });

  it('switches to the preset fragment once the host has acknowledged', () => {
    const out = resolveTonePrompt({
      conciergeTone: 'professional',
      legacyToneNote: NOTE,
      legacyToneAckAt: '2026-08-05T00:00:00Z',
    });
    expect(out).toBe(tonePresetFor('professional').promptFragment);
    expect(out).not.toContain('surfer');
  });

  it('uses the preset when there is no legacy note at all', () => {
    expect(resolveTonePrompt({ conciergeTone: 'casual' })).toBe(
      tonePresetFor('casual').promptFragment,
    );
  });

  it('falls back to the default preset for a property with nothing set', () => {
    expect(resolveTonePrompt({})).toBe(tonePresetFor(DEFAULT_TONE_PRESET_ID).promptFragment);
  });
});

describe('suggestTonePreset', () => {
  it('suggests casual for the real production surfer-dude note', () => {
    // "warm" and "welcoming" both point at friendly, but "surfer", "personality",
    // "fun" and "vibe" are the distinctive part of what this host asked for.
    expect(
      suggestTonePreset(
        'Warm, welcoming, and local but with a surfer dude personality and vibe for added fun to every output.',
      ),
    ).toBe('casual');
  });

  it('suggests professional for the real production warm_professional value', () => {
    expect(suggestTonePreset('warm_professional')).toBe('professional');
  });

  it('reads the obvious keyword in each direction', () => {
    expect(suggestTonePreset('Upscale, refined, white-glove service')).toBe('luxury_concierge');
    expect(suggestTonePreset('Great with families and kids')).toBe('family_friendly');
    expect(suggestTonePreset('Playful and chill, emoji welcome')).toBe('casual');
    expect(suggestTonePreset('Formal and courteous at all times')).toBe('professional');
    expect(suggestTonePreset('Cheerful and kind')).toBe('friendly');
  });

  it('prefers the more specific signal when a note mixes them', () => {
    // Nearly every tone note says something warm, so warmth alone must not win.
    expect(suggestTonePreset('Warm, friendly, and discreetly luxurious and refined')).toBe(
      'luxury_concierge',
    );
  });

  it('falls back to the default for an empty or unrecognisable note', () => {
    for (const bad of ['', '   ', null, undefined, 'zzzz qqqq']) {
      expect(suggestTonePreset(bad)).toBe(DEFAULT_TONE_PRESET_ID);
    }
  });
});

describe('normalizeRestrictedTopicKeys', () => {
  it('drops unknown keys and non-strings', () => {
    expect(normalizeRestrictedTopicKeys(['pricing', 'not_a_topic', 7, null, 'refunds'])).toEqual([
      'pricing',
      'refunds',
    ]);
  });

  it('de-duplicates', () => {
    expect(normalizeRestrictedTopicKeys(['pricing', 'pricing', 'pricing'])).toEqual(['pricing']);
  });

  it('returns keys in canonical order regardless of submitted order', () => {
    const forward = normalizeRestrictedTopicKeys(['pricing', 'legal_advice', 'owner_details']);
    const reverse = normalizeRestrictedTopicKeys(['owner_details', 'legal_advice', 'pricing']);
    expect(forward).toEqual(reverse);
  });

  it('returns an empty array for non-array input', () => {
    for (const bad of [null, undefined, 'pricing', {}, 5]) {
      expect(normalizeRestrictedTopicKeys(bad)).toEqual([]);
    }
  });
});

describe('resolveRestrictedTopicKeys', () => {
  // A property created before this column existed must be as protected as one
  // created after it.
  it('gives the four defaults to a row that predates the column', () => {
    expect(resolveRestrictedTopicKeys(null)).toEqual([...DEFAULT_RESTRICTED_TOPIC_KEYS]);
    expect(resolveRestrictedTopicKeys(undefined)).toEqual([...DEFAULT_RESTRICTED_TOPIC_KEYS]);
  });

  it('respects a host who deliberately unchecked everything', () => {
    expect(resolveRestrictedTopicKeys([])).toEqual([]);
  });

  it('every default key is a real option', () => {
    const known = new Set(RESTRICTED_TOPIC_OPTIONS.map((o) => o.key));
    for (const k of DEFAULT_RESTRICTED_TOPIC_KEYS) expect(known.has(k)).toBe(true);
  });
});

describe('buildRestrictedTopicsClause', () => {
  it('renders the phrase, not the key, so the model never sees a slug', () => {
    const clause = buildRestrictedTopicsClause(['pricing'], null)!;
    expect(clause).toContain('nightly rates');
    expect(clause).not.toContain('pricing');
  });

  it('joins several topics into one clause', () => {
    const clause = buildRestrictedTopicsClause(['pricing', 'refunds'], null)!;
    expect(clause).toContain('nightly rates');
    expect(clause).toContain('refunds, cancellations');
  });

  it('appends the custom other text after the presets', () => {
    const clause = buildRestrictedTopicsClause(['pricing'], 'the broken hot tub')!;
    expect(clause.endsWith('the broken hot tub')).toBe(true);
  });

  it('works with a custom entry and no checkboxes', () => {
    expect(buildRestrictedTopicsClause([], 'anything about the dog')).toBe('anything about the dog');
  });

  // No selection must produce no rule at all, not an empty instruction that the
  // model has to interpret.
  it('returns null when there is nothing to restrict', () => {
    expect(buildRestrictedTopicsClause([], null)).toBeNull();
    expect(buildRestrictedTopicsClause([], '   ')).toBeNull();
  });

  it('applies the defaults when the column has never been written', () => {
    const clause = buildRestrictedTopicsClause(null, null)!;
    expect(clause).toContain('nightly rates');
    expect(clause).toContain('legal advice');
    expect(clause).toContain('neighbors');
  });
});

describe('restrictedTopicLabels', () => {
  it('returns host-facing labels in canonical order', () => {
    expect(restrictedTopicLabels(['refunds', 'pricing'])).toEqual([
      'Pricing and rates',
      'Refunds and cancellations',
    ]);
  });

  it('returns an empty list for an empty selection', () => {
    expect(restrictedTopicLabels([])).toEqual([]);
  });
});
