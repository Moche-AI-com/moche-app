import { describe, expect, it } from 'vitest';
import { PARTY_DICTIONARIES, PARTY_STRING_KEYS, partyT } from './party-strings';

const placeholders = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();

describe('party strings', () => {
  it('ships every key in every locale', () => {
    for (const [locale, dict] of Object.entries(PARTY_DICTIONARIES)) {
      expect(Object.keys(dict).sort(), locale).toEqual([...PARTY_STRING_KEYS].sort());
    }
  });

  it('keeps the same {placeholders} as English', () => {
    const en = PARTY_DICTIONARIES.en;
    for (const [locale, dict] of Object.entries(PARTY_DICTIONARIES)) {
      for (const key of PARTY_STRING_KEYS) {
        expect(placeholders(dict[key]), `${locale}.${key}`).toEqual(placeholders(en[key]));
      }
    }
  });

  it('never puts a digit in the door-code reply', () => {
    for (const [locale, dict] of Object.entries(PARTY_DICTIONARIES)) {
      expect(dict.doorCodeReply, locale).not.toMatch(/\d/);
    }
  });

  it('interpolates, maps regional codes, and falls back to English', () => {
    expect(partyT('es')('inviteSpotsMany', { count: 3 })).toBe('Quedan 3 plazas');
    expect(partyT('es-MX')('inviteButton')).toBe('Invita a tu grupo');
    expect(partyT('en-GB')('joinCta')).toBe('Join the stay');
    expect(partyT('xx-unknown')('inviteButton')).toBe('Invite your group');
    expect(partyT(null)('joinCta')).toBe('Join the stay');
    expect(partyT('fr')('inviteShareMessage', { property: 'Villa', date: '5 oct.' })).toContain('Villa');
  });
});
