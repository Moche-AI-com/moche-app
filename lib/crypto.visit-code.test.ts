import { describe, it, expect } from 'vitest';
import { generateVisitCode, hashVisitCode, verifyVisitCode } from './crypto';

describe('generateVisitCode', () => {
  it('always returns a 4-digit numeric string', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVisitCode();
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it('zero-pads small values instead of shortening them', () => {
    // Not deterministic by input, but repeated sampling should surface a
    // leading-zero code given 10,000 possible values and enough draws.
    const codes = Array.from({ length: 500 }, () => generateVisitCode());
    expect(codes.some((c) => c.startsWith('0'))).toBe(true);
    expect(codes.every((c) => c.length === 4)).toBe(true);
  });
});

describe('hashVisitCode / verifyVisitCode', () => {
  it('produces a verifiable hash for the correct code + link', () => {
    const hash = hashVisitCode('1234', 'link-a');
    expect(verifyVisitCode('1234', 'link-a', hash)).toBe(true);
  });

  it('rejects the wrong code', () => {
    const hash = hashVisitCode('1234', 'link-a');
    expect(verifyVisitCode('9999', 'link-a', hash)).toBe(false);
  });

  it('rejects a correct code hashed for a different link (no cross-link replay)', () => {
    const hash = hashVisitCode('1234', 'link-a');
    expect(verifyVisitCode('1234', 'link-b', hash)).toBe(false);
  });

  it('is deterministic for the same code + link', () => {
    expect(hashVisitCode('0007', 'link-x')).toBe(hashVisitCode('0007', 'link-x'));
  });

  it('produces different hashes for different codes on the same link', () => {
    expect(hashVisitCode('0001', 'link-x')).not.toBe(hashVisitCode('0002', 'link-x'));
  });

  it('never returns the plaintext code as the hash', () => {
    const hash = hashVisitCode('4242', 'link-a');
    expect(hash).not.toBe('4242');
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});
