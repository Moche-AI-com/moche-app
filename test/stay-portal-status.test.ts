import { describe, expect, it } from 'vitest';
import { portalCodeStatus } from '@/lib/guest/portal-status';

describe('portalCodeStatus', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it('reports revoked before anything else, even while unexpired', () => {
    expect(portalCodeStatus({ codeExpiresAt: future, codeRevokedAt: past })).toBe('revoked');
  });

  it('reports expired once check-out + grace has passed', () => {
    expect(portalCodeStatus({ codeExpiresAt: past, codeRevokedAt: null })).toBe('expired');
  });

  it('reports active while the code is inside its window', () => {
    expect(portalCodeStatus({ codeExpiresAt: future, codeRevokedAt: null })).toBe('active');
  });

  it('treats a missing expiry as active (the link-level expiry still governs the URL)', () => {
    expect(portalCodeStatus({ codeExpiresAt: null, codeRevokedAt: null })).toBe('active');
  });
});
