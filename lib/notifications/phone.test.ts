import { describe, expect, it } from 'vitest';
import { normalizeSmsPhone } from './phone';

describe('normalizeSmsPhone', () => {
  it('keeps E.164 input and strips formatting', () => {
    expect(normalizeSmsPhone('+1 (781) 555-0123')).toBe('+17815550123');
    expect(normalizeSmsPhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizeSmsPhone('+1 800 555 0123')).toBe('+18005550123');
  });

  it('treats bare US numbers as +1', () => {
    expect(normalizeSmsPhone('7815550123')).toBe('+17815550123');
    expect(normalizeSmsPhone('(781) 555-0123')).toBe('+17815550123');
    expect(normalizeSmsPhone('781.555.0123')).toBe('+17815550123');
    expect(normalizeSmsPhone('781-555-0123')).toBe('+17815550123');
    expect(normalizeSmsPhone('1 781 555 0123')).toBe('+17815550123');
    expect(normalizeSmsPhone('1-781-555-0123')).toBe('+17815550123');
    expect(normalizeSmsPhone(' 17815550123 ')).toBe('+17815550123');
  });

  it('rejects ambiguous, service-code, or invalid input', () => {
    for (const phone of [
      '', '12345', '0815550123', '1815550123', '7810550123', '27815550123',
      '5005550006', '8005550123', '9115550123', '4115550123',
      '+0123456789', 'text +15005550006', '+1+5005550006', '+1234567890123456', '781-555-012a',
    ]) {
      expect(normalizeSmsPhone(phone)).toBeNull();
    }
  });
});
