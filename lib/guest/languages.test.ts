import { describe, it, expect } from 'vitest';
import {
  PORTAL_LANGUAGES,
  AUTO_LANGUAGE,
  DEFAULT_HOST_LANGUAGE,
  resolveLanguage,
  isPortalLanguage,
  languageLabel,
  languageNativeLabel,
  needsTranslation,
  searchLanguages,
} from './languages';

describe('PORTAL_LANGUAGES', () => {
  it('has no duplicate codes', () => {
    const codes = PORTAL_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses BCP-47 shaped codes and non-empty labels', () => {
    for (const l of PORTAL_LANGUAGES) {
      expect(l.code).toMatch(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/);
      expect(l.label.trim().length).toBeGreaterThan(0);
      expect(l.nativeLabel.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate codes once case is folded, since lookup is case-insensitive', () => {
    const folded = PORTAL_LANGUAGES.map((l) => l.code.toLowerCase());
    expect(new Set(folded).size).toBe(folded.length);
  });

  it('includes the default host language so the host picker always has a valid default', () => {
    expect(PORTAL_LANGUAGES.some((l) => l.code === DEFAULT_HOST_LANGUAGE)).toBe(true);
  });
});

describe('resolveLanguage', () => {
  it('resolves an exact code regardless of case or padding', () => {
    expect(resolveLanguage('fr')?.code).toBe('fr');
    expect(resolveLanguage('  FR ')?.code).toBe('fr');
  });

  it('prefers an exact regional match over the base language', () => {
    expect(resolveLanguage('pt-BR')?.code).toBe('pt-BR');
    expect(resolveLanguage('pt-br')?.code).toBe('pt-BR');
    expect(resolveLanguage('zh-Hant')?.code).toBe('zh-Hant');
  });

  it('falls back to the primary subtag when the region is not listed', () => {
    expect(resolveLanguage('en-US')?.code).toBe('en');
    expect(resolveLanguage('fr-CA')?.code).toBe('fr');
    expect(resolveLanguage('de-AT')?.code).toBe('de');
  });

  it('treats auto, blanks, and non-strings as no language', () => {
    expect(resolveLanguage(AUTO_LANGUAGE)).toBeNull();
    expect(resolveLanguage('AUTO')).toBeNull();
    expect(resolveLanguage('')).toBeNull();
    expect(resolveLanguage('   ')).toBeNull();
    expect(resolveLanguage(null)).toBeNull();
    expect(resolveLanguage(42)).toBeNull();
  });

  it('returns null for an unknown language rather than guessing', () => {
    expect(resolveLanguage('xx')).toBeNull();
    expect(resolveLanguage('klingon')).toBeNull();
  });
});

describe('isPortalLanguage', () => {
  it('accepts supported codes and rejects everything else', () => {
    expect(isPortalLanguage('es')).toBe(true);
    expect(isPortalLanguage('es-MX')).toBe(true);
    expect(isPortalLanguage('auto')).toBe(false);
    expect(isPortalLanguage(undefined)).toBe(false);
  });
});

describe('label helpers', () => {
  it('falls back to English instead of throwing on unknown input', () => {
    expect(languageLabel('zz')).toBe('English');
    expect(languageNativeLabel('zz')).toBe('English');
  });

  it('returns the endonym for guest-facing UI', () => {
    const fr = PORTAL_LANGUAGES.find((l) => l.code === 'fr');
    expect(languageNativeLabel('fr')).toBe(fr?.nativeLabel);
  });
});

describe('needsTranslation', () => {
  it('is false when both sides read the same language', () => {
    expect(needsTranslation('en', 'en')).toBe(false);
    expect(needsTranslation('EN', 'en-GB')).toBe(false);
  });

  it('is true only when both sides are known and different', () => {
    expect(needsTranslation('fr', 'en')).toBe(true);
  });

  it('is false when either side is unknown, so we never translate blind', () => {
    expect(needsTranslation('auto', 'en')).toBe(false);
    expect(needsTranslation('fr', 'auto')).toBe(false);
    expect(needsTranslation(null, null)).toBe(false);
  });
});

describe('searchLanguages', () => {
  it('returns the full list for an empty query', () => {
    expect(searchLanguages('  ')).toHaveLength(PORTAL_LANGUAGES.length);
  });

  it('matches on code, English name, and endonym', () => {
    expect(searchLanguages('de').some((l) => l.code === 'de')).toBe(true);
    expect(searchLanguages('french').some((l) => l.code === 'fr')).toBe(true);
    const es = PORTAL_LANGUAGES.find((l) => l.code === 'es');
    expect(searchLanguages(es!.nativeLabel).some((l) => l.code === 'es')).toBe(true);
  });

  it('returns nothing for a query that matches no language', () => {
    expect(searchLanguages('zzzzzz')).toHaveLength(0);
  });
});
