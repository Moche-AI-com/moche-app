import { describe, expect, it } from 'vitest';
import { guestEmailPage, maskGuestEmail, normalizeGuestEmail } from './email-alerts-core';

describe('normalizeGuestEmail', () => {
  it('accepts and lowercases plausible addresses', () => {
    expect(normalizeGuestEmail('  Guest.Name+stay@Example.COM ')).toBe('guest.name+stay@example.com');
  });
  it('rejects non-emails and header-injection attempts', () => {
    for (const bad of ['', 'nope', 'a@b', 'a@b.c', 'x y@example.com', 'a@example.com\nbcc:x@y.com', '<a@b.com>', 42, null]) {
      expect(normalizeGuestEmail(bad)).toBeNull();
    }
  });
});

describe('maskGuestEmail', () => {
  it('never reveals the full local part', () => {
    expect(maskGuestEmail('johnny@gmail.com')).toBe('j•••@gmail.com');
  });
});

describe('guestEmailPage', () => {
  it('escapes all interpolated values', () => {
    const page = guestEmailPage({ title: '<t>', body: '"b"', action: { url: '/x?a=1&b=2', token: '"><script>', label: 'Go' } });
    expect(page).not.toContain('<script>');
    expect(page).toContain('&quot;&gt;&lt;script&gt;');
    expect(page).toContain('/x?a=1&amp;b=2');
    expect(page).toContain('method="post"');
  });
});
