import 'server-only';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';

// ============================================================================
// URL ingestion boundary (Firecrawl).
//
// Security contract (from spec):
//  - Firecrawl credentials NEVER reach the browser. This module is server-only
//    and the key is read from serverEnv.
//  - SSRF protection: the target host is resolved and every resolved IP is
//    checked against private/loopback/link-local/metadata ranges BEFORE any
//    fetch. Non-http(s) schemes and credentialed URLs are rejected.
//  - Redirects are not blindly followed to internal targets: we fetch with
//    redirect:'manual' in the dev fallback and rely on Firecrawl's own fetch
//    in production, but we still pre-validate the initial host.
//  - Response size is capped.
//  - Returned content is UNTRUSTED reference data. Callers must treat it as
//    data, never as instructions to the AI (the concierge wraps it in an
//    <untrusted_context> block).
// ============================================================================

export interface FetchedPage {
  title: string;
  text: string;
  sourceUrl: string;
}

const MAX_BYTES = 2_000_000; // 2 MB of text
const FETCH_TIMEOUT_MS = 15_000;

class SsrfError extends Error {}

// Blocklisted CIDR checks for IPv4 + common IPv6 cases.
function isBlockedIp(ip: string): boolean {
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
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  // IPv6
  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true; // loopback / unspecified
  if (low.startsWith('fe80')) return true; // link-local
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique local fc00::/7
  if (low.startsWith('::ffff:')) {
    // IPv4-mapped — extract and re-check.
    const mapped = low.split(':').pop() ?? '';
    if (isIP(mapped) === 4) return isBlockedIp(mapped);
  }
  return false;
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
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

function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
  return { title, text: decodeEntities(text).replace(/\s+/g, ' ').trim() };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x2F;/g, '/');
}

// Dev fallback: fetch the page directly (still SSRF-guarded, manual redirects, size-capped).
async function devFetch(url: URL): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res = await fetch(url.toString(), { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'MocheBot/1.0' } });
    // Handle one level of redirect, re-validating the target.
    let redirects = 0;
    while (res.status >= 300 && res.status < 400 && res.headers.get('location') && redirects < 3) {
      const next = new URL(res.headers.get('location')!, url);
      await assertPublicUrl(next.toString());
      res = await fetch(next.toString(), { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'MocheBot/1.0' } });
      redirects++;
    }
    if (!res.ok) throw new Error(`Fetch returned ${res.status}`);
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BYTES) { reader.cancel(); break; }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const { title, text } = htmlToText(buf.toString('utf8'));
    return { title: title || url.hostname, text, sourceUrl: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

// Production: call Firecrawl. Key stays server-side.
async function firecrawlFetch(url: URL): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * 2);
  try {
    const res = await fetch(`${serverEnv.firecrawlBaseUrl.replace(/\/$/, '')}/v1/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${serverEnv.firecrawlApiKey}` },
      body: JSON.stringify({ url: url.toString(), formats: ['markdown'], onlyMainContent: true }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn('firecrawl_error', { status: res.status, snippet: body.slice(0, 200) });
      throw new Error('The page could not be fetched right now.');
    }
    const json: any = await res.json();
    const md: string = json?.data?.markdown ?? json?.markdown ?? '';
    const title: string = json?.data?.metadata?.title ?? json?.metadata?.title ?? url.hostname;
    let text = md.slice(0, MAX_BYTES);
    return { title, text: text.replace(/\s+\n/g, '\n').trim(), sourceUrl: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUrlContent(rawUrl: string): Promise<FetchedPage> {
  const url = await assertPublicUrl(rawUrl); // throws SsrfError on disallowed targets
  const useFallback = serverEnv.ingestionDevFallback || !serverEnv.firecrawlApiKey;
  const page = useFallback ? await devFetch(url) : await firecrawlFetch(url);
  if (!page.text || page.text.length < 20) {
    throw new Error('No readable text was found on that page.');
  }
  return page;
}

export function isSsrfError(e: unknown): e is Error {
  return e instanceof SsrfError;
}
