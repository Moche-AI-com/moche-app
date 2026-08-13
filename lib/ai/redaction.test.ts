import { describe, it, expect } from 'vitest';
import { redactPII, redactMessages, luhnValid, containsLikelyPII } from './redaction';

describe('redactPII — emails', () => {
  it('redacts a plain email', () => {
    expect(redactPII('contact me at jane.doe@example.com please')).toContain('[redacted-email]');
    expect(redactPII('jane.doe@example.com')).not.toContain('example.com');
  });
  it('redacts plus-addressed and subdomained emails', () => {
    expect(redactPII('host+tag@mail.sub.example.co.uk')).toBe('[redacted-email]');
  });
});

describe('redactPII — credit cards (Luhn)', () => {
  it('redacts a valid Visa test number', () => {
    expect(redactPII('card 4111 1111 1111 1111 exp')).toContain('[redacted-cc]');
  });
  it('redacts a dash-separated valid number', () => {
    expect(redactPII('4111-1111-1111-1111')).toBe('[redacted-cc]');
  });
  it('does NOT treat a Luhn-invalid 16-digit run as a card', () => {
    // 1234... fails Luhn — should not be redacted as a card (may still hit digit fallback).
    const out = redactPII('order 1234567812345670no');
    expect(out).not.toContain('[redacted-cc]');
  });
});

describe('redactPII — phones', () => {
  it('redacts an international phone', () => {
    expect(redactPII('call +1 (555) 123-4567 now')).toContain('[redacted-phone]');
  });
  it('leaves a short number alone', () => {
    // Fewer than 8 digits — not treated as a phone.
    const out = redactPII('room 214');
    expect(out).not.toContain('[redacted-phone]');
  });
});

describe('redactPII — labeled secrets', () => {
  it('redacts wifi password value', () => {
    expect(redactPII('WiFi password: SunFlower22!')).not.toContain('SunFlower22');
  });
  it('redacts door/access codes', () => {
    expect(redactPII('door code 4821')).toMatch(/door code: \[redacted\]/i);
    expect(redactPII('access code = 99A2')).toMatch(/access code: \[redacted\]/i);
  });
  it('redacts SSID/network key labels', () => {
    expect(redactPII('SSID: HomeNet_5G')).not.toContain('HomeNet_5G');
  });
});

describe('redactPII — postal addresses', () => {
  it('redacts a street address (best-effort)', () => {
    expect(redactPII('We live at 221 Baker Street.')).toContain('[redacted-address]');
    expect(redactPII('123 Somerville Ave')).toContain('[redacted-address]');
  });
  it('does not redact ordinary prose without a street suffix', () => {
    const out = redactPII('The house has 3 bedrooms and a garden.');
    expect(out).not.toContain('[redacted-address]');
  });
});

describe('redactPII — long-digit fallback + false-positive guards', () => {
  it('masks a long order number keeping last two digits', () => {
    expect(redactPII('confirmation 987654')).toContain('***54');
  });
  it('leaves normal words and small numbers intact', () => {
    const out = redactPII('Check-out is at 11 am and quiet hours start at 10 pm.');
    expect(out).toContain('Check-out');
    expect(out).toContain('11 am');
    expect(out).not.toContain('[redacted');
  });
});

describe('luhnValid', () => {
  it('accepts a valid number', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
  });
  it('rejects an invalid number', () => {
    expect(luhnValid('4111111111111112')).toBe(false);
  });
  it('rejects too-short / too-long input', () => {
    expect(luhnValid('4111')).toBe(false);
    expect(luhnValid('41111111111111111111')).toBe(false);
  });
});

describe('redactMessages', () => {
  it('redacts each message content but preserves roles', () => {
    const out = redactMessages([
      { role: 'system', content: 'no pii here' },
      { role: 'user', content: 'email me at a@b.com' },
    ]);
    expect(out[0].role).toBe('system');
    expect(out[1].content).toContain('[redacted-email]');
  });
});

describe('containsLikelyPII', () => {
  it('is false for fully redacted text', () => {
    expect(containsLikelyPII(redactPII('a@b.com and 4111 1111 1111 1111'))).toBe(false);
  });
  it('detects a raw email that slipped through', () => {
    expect(containsLikelyPII('leftover raw@example.com')).toBe(true);
  });
  it('is false for benign text', () => {
    expect(containsLikelyPII('the wifi works great')).toBe(false);
  });
});

// --- Regression: the production Wi-Fi leak (see BUG HISTORY in redaction.ts) ---
//
// The old SECRET_LABEL_RE consumed the filler word instead of the value, so a real
// host sentence came out as a [redacted] marker printed next to an intact password,
// and the SSID sentence was destroyed. These tests pin both halves of the fix.
describe('redactPII — Wi-Fi leak regression', () => {
  const LEAKY = 'The WiFi network name is CapeHouse-Guest and the password is Dennis2026!';

  it('removes the password value, not the filler word', () => {
    const out = redactPII(LEAKY);
    expect(out).not.toContain('Dennis2026');
    expect(out).toMatch(/password: \[redacted\]/i);
  });

  it('leaves the network name (SSID) intact — it is not a secret by registry typing', () => {
    const out = redactPII(LEAKY);
    expect(out).toContain('CapeHouse-Guest');
    expect(out).toContain('network name');
  });

  it('does not mangle the sentence around the SSID', () => {
    // The old pattern produced "The WiFi: [redacted] name is CapeHouse-Guest".
    expect(redactPII(LEAKY)).not.toMatch(/wi-?fi:\s*\[redacted\]/i);
  });

  it('repairs text already mangled by the previous buggy pattern', () => {
    // Exactly what production wrote into answer_cache and messages.
    const mangled = 'The WiFi: [redacted] network name is CapeHouse-Guest and the password: [redacted] is Dennis2026!';
    const out = redactPII(mangled);
    expect(out).not.toContain('Dennis2026');
  });

  it('repairs the no-filler mangled variant too', () => {
    const out = redactPII('the password: [redacted] Dennis2026!');
    expect(out).not.toContain('Dennis2026');
  });

  it('keeps prose answers usable instead of masking them', () => {
    const out = redactPII('The door code is on the arrival card.');
    expect(out).toContain('arrival card');
    expect(out).not.toContain('[redacted]');
  });

  it('is idempotent', () => {
    const once = redactPII(LEAKY);
    expect(redactPII(once)).toBe(once);
  });
});
