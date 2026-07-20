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

// Realistic browser headers so mainstream sites don't reject the request as a
// naive bot. Zillow-class anti-bot walls may still block this, but the vast
// majority of listing / info pages (Airbnb, VRBO, booking pages, small sites)
// respond fine to a browser-shaped request.
const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
};

// Direct fetch (SSRF-guarded, manual redirects, size-capped) with browser-like
// headers. Used as the dev-fallback AND as the production fallback when
// Firecrawl is unavailable (e.g. out of credits).
async function directFetch(url: URL): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let res = await fetch(url.toString(), { redirect: 'manual', signal: controller.signal, headers: BROWSER_HEADERS });
    // Handle one level of redirect, re-validating the target.
    let redirects = 0;
    while (res.status >= 300 && res.status < 400 && res.headers.get('location') && redirects < 3) {
      const next = new URL(res.headers.get('location')!, url);
      await assertPublicUrl(next.toString());
      res = await fetch(next.toString(), { redirect: 'manual', signal: controller.signal, headers: BROWSER_HEADERS });
      redirects++;
    }
    if (!res.ok) {
      const err = new Error(`Fetch returned ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
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

// One Firecrawl scrape attempt with a given proxy mode.
// `proxy: 'stealth'` routes through anti-bot-evading infrastructure (needed for
// aggressive sites like Zillow/Airbnb that 403 or challenge basic scrapers).
async function firecrawlScrape(url: URL, proxy: 'basic' | 'stealth'): Promise<FetchedPage> {
  const controller = new AbortController();
  // Stealth + JS render is slower; give it a longer ceiling.
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * (proxy === 'stealth' ? 4 : 2));
  try {
    const res = await fetch(`${serverEnv.firecrawlBaseUrl.replace(/\/$/, '')}/v1/scrape`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${serverEnv.firecrawlApiKey}` },
      body: JSON.stringify({
        url: url.toString(),
        formats: ['markdown'],
        onlyMainContent: true,
        blockAds: true,
        removeBase64Images: true,
        proxy,
        // Give client-rendered listings time to hydrate before capture.
        waitFor: proxy === 'stealth' ? 3500 : 1200,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn('firecrawl_error', { status: res.status, proxy, snippet: body.slice(0, 200) });
      const err = new Error(`Firecrawl returned ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const md: string = json?.data?.markdown ?? json?.markdown ?? '';
    const title: string = json?.data?.metadata?.title ?? json?.metadata?.title ?? url.hostname;
    const text = md.slice(0, MAX_BYTES);
    return { title, text: text.replace(/\s+\n/g, '\n').trim(), sourceUrl: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

// Try Firecrawl: cheap basic scrape first, then stealth if it comes back thin.
// Returns null (never throws) so the caller can fall through to a direct fetch
// when Firecrawl is unavailable (out of credits, 402, network error, etc.).
async function tryFirecrawl(url: URL): Promise<FetchedPage | null> {
  if (!serverEnv.firecrawlApiKey) return null;
  try {
    const first = await firecrawlScrape(url, 'basic');
    if (first.text && first.text.length >= 200) return first;
    log.warn('firecrawl_thin_retry_stealth', { host: url.hostname, len: first.text.length });
  } catch (e) {
    log.warn('firecrawl_basic_failed', { host: url.hostname, error: e instanceof Error ? e.message : 'unknown' });
  }
  try {
    const stealth = await firecrawlScrape(url, 'stealth');
    if (stealth.text && stealth.text.length >= 100) return stealth;
  } catch (e) {
    log.warn('firecrawl_stealth_failed', { host: url.hostname, error: e instanceof Error ? e.message : 'unknown' });
  }
  return null;
}

export async function fetchUrlContent(rawUrl: string): Promise<FetchedPage> {
  const url = await assertPublicUrl(rawUrl); // throws SsrfError on disallowed targets

  // Fetch chain:
  //  1. Firecrawl (basic -> stealth) when a key is configured and we're not
  //     forcing the dev fallback. Best for JS-rendered / mildly-protected sites.
  //  2. Direct browser-shaped fetch as a resilient fallback (works on most
  //     mainstream sites; free; used when Firecrawl is unavailable/out of credits).
  const preferDirect = serverEnv.ingestionDevFallback;

  let page: FetchedPage | null = null;
  if (!preferDirect) {
    page = await tryFirecrawl(url);
  }

  if (!page || !page.text || page.text.length < 20) {
    // Fall through to a direct fetch. This is the free fallback path.
    try {
      const direct = await directFetch(url);
      if (direct.text && direct.text.length >= 20) page = direct;
    } catch (e) {
      const status = (e as any)?.status;
      if (status === 403 || status === 401 || status === 429) {
        throw new Error(
          'That site is blocking automated access (common on Zillow). Open the listing, copy its details, and paste them in via a document/text upload \u2014 the tool will still clean and organize it for you.',
        );
      }
      // otherwise fall through to the generic message below
    }
  }

  if (!page || !page.text || page.text.length < 20) {
    throw new Error('No readable text was found on that page. Try pasting the listing details in manually.');
  }
  return page;
}

export function isSsrfError(e: unknown): e is Error {
  return e instanceof SsrfError;
}
