import { describe, it, expect } from 'vitest';
import { linkify, isSafeHttpUrl, hasLinks, type LinkifiedLink } from './linkify';

const links = (text: string): LinkifiedLink[] =>
  linkify(text).filter((s): s is LinkifiedLink => s.kind === 'link');

const plain = (text: string): string =>
  linkify(text)
    .map((s) => (s.kind === 'text' ? s.value : s.label))
    .join('');

describe('linkify', () => {
  it('round-trips the original text exactly', () => {
    const src = 'Book at https://example.com/spa or call +1 (555) 123-4567 — ask for Ana.';
    expect(plain(src)).toBe(src);
  });

  it('returns a single text segment when there is nothing to link', () => {
    const out = linkify('Checkout is at 11am.');
    expect(out).toEqual([{ kind: 'text', value: 'Checkout is at 11am.' }]);
  });

  it('links an https url', () => {
    const [l] = links('See https://example.com/menu for tonight.');
    expect(l.href).toBe('https://example.com/menu');
    expect(l.label).toBe('https://example.com/menu');
    expect(l.linkKind).toBe('url');
  });

  it('gives a bare www host an explicit scheme', () => {
    const [l] = links('Try www.example.com today.');
    expect(l.href).toBe('https://www.example.com');
    expect(l.label).toBe('www.example.com');
  });

  it('hands trailing sentence punctuation back to the text run', () => {
    const [l] = links('Details at https://example.com/spa.');
    expect(l.href).toBe('https://example.com/spa');
    expect(plain('Details at https://example.com/spa.')).toBe('Details at https://example.com/spa.');
  });

  it('links an email as mailto', () => {
    const [l] = links('Email host@example.com anytime.');
    expect(l.href).toBe('mailto:host@example.com');
    expect(l.linkKind).toBe('email');
  });

  it('does not half-match an email as a url', () => {
    const found = links('Write to ana@example.com please.');
    expect(found).toHaveLength(1);
    expect(found[0].linkKind).toBe('email');
  });

  it('links a bare E.164 number', () => {
    const [l] = links('Front desk: +15551234567');
    expect(l.linkKind).toBe('phone');
    expect(l.href).toBe('tel:+15551234567');
  });

  it('links a phone number', () => {
    const [l] = links('Call +1 555 123 4567 for the front desk.');
    expect(l.linkKind).toBe('phone');
    expect(l.href.startsWith('tel:')).toBe(true);
  });

  it('does not turn dates, prices, or dimensions into phone links', () => {
    expect(links('Checkout 11/08/2026')).toHaveLength(0);
    expect(links('It costs 35.00')).toHaveLength(0);
    expect(links('The room is 12 x 14')).toHaveLength(0);
  });

  it('always takes the anchor label from the source text, never from anywhere else', () => {
    const src = 'Go to https://example.com/a and mail x@example.com and call +15551234567';
    const found = links(src);
    expect(found.length).toBe(3);
    for (const l of found) {
      expect(src).toContain(l.label);
    }
  });

  it('handles an empty string without throwing', () => {
    expect(linkify('')).toEqual([]);
  });
});

describe('isSafeHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isSafeHttpUrl('https://example.com')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript, data, and file schemes', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSafeHttpUrl('not a url')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});

describe('hasLinks', () => {
  it('reports whether anything would be linked', () => {
    expect(hasLinks('Visit https://example.com')).toBe(true);
    expect(hasLinks('Towels are in the closet.')).toBe(false);
  });
});
