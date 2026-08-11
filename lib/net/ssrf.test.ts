import { describe, it, expect } from 'vitest';
import { isBlockedIp, assertPublicUrl, isSsrfError, SsrfError } from './ssrf';

describe('isBlockedIp', () => {
  it('blocks IPv4 private and reserved ranges', () => {
    for (const ip of [
      '10.0.0.1',
      '10.255.255.255',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.169.254', // cloud metadata
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
      '255.255.255.255',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4 addresses', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.255.255', '93.184.216.34']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback, link-local and unique-local', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows public IPv6', () => {
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('rejects malformed URLs', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects non-http schemes', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com', 'data:text/plain,hi']) {
      await expect(assertPublicUrl(u), u).rejects.toBeInstanceOf(SsrfError);
    }
  });

  it('rejects embedded credentials', async () => {
    await expect(assertPublicUrl('https://user:pass@example.com/')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects internal hostnames without touching DNS', async () => {
    for (const u of [
      'http://localhost/',
      'http://app.localhost/',
      'http://db.internal/',
      'http://printer.local/',
    ]) {
      await expect(assertPublicUrl(u), u).rejects.toBeInstanceOf(SsrfError);
    }
  });

  it('rejects private IP literals', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl('http://[::1]:8080/')).rejects.toBeInstanceOf(SsrfError);
  });

  it('accepts a public IP literal', async () => {
    const url = await assertPublicUrl('https://1.1.1.1/img.jpg');
    expect(url.hostname).toBe('1.1.1.1');
  });

  it('exposes a type guard for its own errors', () => {
    expect(isSsrfError(new SsrfError('x'))).toBe(true);
    expect(isSsrfError(new Error('x'))).toBe(false);
  });
});

describe('expanded SSRF range protections', () => {
  it('blocks protocol, documentation, benchmarking and future-use IPv4 ranges', () => {
    for (const ip of ['192.0.0.8', '192.0.2.5', '198.18.0.1', '198.19.255.254', '198.51.100.3', '203.0.113.9', '240.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('blocks NAT64, 6to4 and mapped private IPv6 forms', () => {
    for (const ip of ['64:ff9b::808:808', '2002:c000:0204::1', '::ffff:192.168.1.2']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('rejects shorthand, octal, hex and decimal-integer IPv4 host forms before DNS', async () => {
    for (const url of ['http://0177.0.0.1/', 'http://0x7f000001/', 'http://2130706433/', 'http://127.1/']) {
      await expect(assertPublicUrl(url), url).rejects.toBeInstanceOf(SsrfError);
    }
  });
});
