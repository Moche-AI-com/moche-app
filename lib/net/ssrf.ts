import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

// ============================================================================
// Shared SSRF guard.
//
// Extracted from lib/ingest/firecrawl.ts so every server-side outbound fetch of
// a host-supplied URL runs the same checks. Two callers today: listing-URL
// ingestion and cover-image fetch-and-store. Both accept an arbitrary URL typed
// by a host, so both must resolve the target and reject private / loopback /
// link-local / metadata addresses BEFORE any request leaves the process.
//
// Deliberately dependency-free and pure apart from the DNS lookup, so the
// address-range logic is unit-testable without network access.
// ============================================================================

export class SsrfError extends Error {}

export function isSsrfError(e: unknown): e is SsrfError {
  return e instanceof SsrfError;
}

/** True when an IP literal falls in a range we never allow as a fetch target. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 192 && (b === 0 || b === 2)) return true; // protocol + TEST-NET-1
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true; // benchmarking + TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 240) return true; // future-use / reserved
    if (a >= 224) return true; // multicast
    return false;
  }
  // IPv6
  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true; // loopback / unspecified
  if (low.startsWith('fe80')) return true; // link-local
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique local fc00::/7
  if (low.startsWith('64:ff9b:') || low.startsWith('2002:')) return true; // NAT64 + 6to4
  if (low.startsWith('::ffff:')) {
    // IPv4-mapped — extract and re-check.
    const mapped = low.split(':').pop() ?? '';
    if (isIP(mapped) === 4) return isBlockedIp(mapped);
  }
  return false;
}

/**
 * Validates a host-supplied URL as a safe outbound fetch target.
 * Throws SsrfError with a user-showable message on every rejection.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  // URL() canonicalizes legacy IPv4 forms, so inspect the authority before parsing.
  const rawAuthority = rawUrl.match(/^[a-z][a-z0-9+.-]*:\/\/([^\/?#]+)/i)?.[1]?.replace(/^[^@]*@/, '') ?? '';
  const rawHost = rawAuthority.startsWith('[') ? rawAuthority.slice(1, rawAuthority.indexOf(']')) : rawAuthority.replace(/:\d+$/, '');
  if (/^0x[0-9a-f]+$/i.test(rawHost) || /^0[0-9]+(?:\.[0-9]+){0,3}$/.test(rawHost) || /^\d+$/.test(rawHost) || /^\d+(?:\.\d+){0,2}$/.test(rawHost)) {
    throw new SsrfError('Non-standard IP address formats are not allowed.');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('That does not look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.');
  }
  if (url.username || url.password) {
    throw new SsrfError('URLs with embedded credentials are not allowed.');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new SsrfError('Internal hostnames are not allowed.');
  }
  // If the host is already an IP literal, check it directly.
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfError('That address is not allowed.');
    return url;
  }
  // Resolve and check every address.
  let addrs: string[] = [];
  try {
    const results = await dns.lookup(host, { all: true });
    addrs = results.map((r) => r.address);
  } catch {
    throw new SsrfError('Could not resolve that host.');
  }
  if (addrs.length === 0) throw new SsrfError('Could not resolve that host.');
  for (const addr of addrs) {
    if (isBlockedIp(addr)) throw new SsrfError('That host resolves to a private address and is not allowed.');
  }
  return url;
}
