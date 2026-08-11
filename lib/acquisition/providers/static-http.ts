import 'server-only';
import dns from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { assertPublicUrl, isBlockedIp } from '@/lib/net/ssrf';
import type { AcquisitionProvider, AcquisitionResult } from '../types';
import type { AcquisitionProfile } from '../profiles';

const BROWSER_HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
};
const MAX_REDIRECTS = 3;

type PinnedResponse = { status: number; headers: http.IncomingHttpHeaders; body: IncomingMessage };

/**
 * Resolve immediately before connecting, reject every blocked answer, and connect
 * to the selected IP address rather than asking the transport to resolve again.
 * The original hostname remains the Host header and HTTPS SNI value, preserving
 * virtual hosting and certificate validation while closing the DNS rebind window.
 */
async function requestPinned(url: URL, signal: AbortSignal): Promise<PinnedResponse> {
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => isBlockedIp(address.address))) {
    throw new Error('Resolved to a blocked address.');
  }
  const target = addresses[0];
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: target.address,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { ...BROWSER_HEADERS, host: url.host },
      // HTTPS validates the certificate against this SNI name, not the pinned IP.
      servername: url.protocol === 'https:' ? url.hostname : undefined,
    }, (body) => resolve({ status: body.statusCode ?? 0, headers: body.headers, body }));
    const abort = () => request.destroy(signal.reason instanceof Error ? signal.reason : new Error('Request aborted.'));
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort, { once: true });
    request.once('error', reject);
    request.end();
  });
}

function header(headers: http.IncomingHttpHeaders, name: string): string | null {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x2F;/g, '/');
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

async function readCapped(body: IncomingMessage, maxBytes: number): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let truncated = false;
    const finish = () => resolve({ body: Buffer.concat(chunks), truncated });
    body.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        truncated = true;
        body.destroy();
        finish();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    body.once('end', finish);
    body.once('error', (error) => { if (truncated) return; reject(error); });
  });
}

export const staticHttpProvider: AcquisitionProvider = {
  name: 'static-http',
  supports: () => true,
  async fetch(initialUrl, profile, signal): Promise<AcquisitionResult> {
    let url = initialUrl;
    let response = await requestPinned(url, signal);
    let redirects = 0;
    while (response.status >= 300 && response.status < 400 && header(response.headers, 'location')) {
      if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects.');
      response.body.resume();
      url = new URL(header(response.headers, 'location')!, url);
      await assertPublicUrl(url.toString());
      response = await requestPinned(url, signal);
      redirects++;
    }
    if (response.status < 200 || response.status >= 300) {
      response.body.resume();
      const error = new Error(`Fetch returned ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    const capped = await readCapped(response.body, profile.maxBytes);
    const contentType = header(response.headers, 'content-type');
    const isHtml = !contentType || contentType.includes('html') || contentType.includes('xml');
    const parsed = isHtml ? htmlToText(capped.body.toString('utf8')) : { title: url.hostname, text: capped.body.toString('utf8').trim() };
    return {
      title: parsed.title || url.hostname,
      text: parsed.text,
      sourceUrl: initialUrl.toString(),
      finalUrl: url.toString(),
      contentType,
      byteLength: capped.body.byteLength,
      providerName: 'static-http',
      httpStatus: response.status,
      truncated: capped.truncated,
    };
  },
};
