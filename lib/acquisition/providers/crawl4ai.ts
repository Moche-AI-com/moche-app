import 'server-only';
import { serverEnv } from '@/lib/env';
import type { AcquisitionProvider, AcquisitionResult } from '../types';
import type { AcquisitionProfile } from '../profiles';

/** Optional server integration. It remains unavailable until the owner configures CRAWL4AI_BASE_URL. */
export const crawl4aiProvider: AcquisitionProvider = {
  name: 'crawl4ai',
  supports: () => Boolean(serverEnv.crawl4aiBaseUrl),
  async fetch(url, profile, signal): Promise<AcquisitionResult> {
    if (!serverEnv.crawl4aiBaseUrl) throw new Error('Crawl4AI is not configured.');
    const res = await fetch(`${serverEnv.crawl4aiBaseUrl.replace(/\/$/, '')}/crawl`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: url.toString(), js: profile.renderJs, maxBytes: profile.maxBytes }), signal,
    });
    if (!res.ok) { const error = new Error(`Crawl4AI returned ${res.status}`) as Error & { status?: number }; error.status = res.status; throw error; }
    const body = await res.json() as { title?: string; text?: string; finalUrl?: string; contentType?: string };
    const original = body.text ?? '';
    const text = Buffer.from(original, 'utf8').subarray(0, profile.maxBytes).toString('utf8');
    return { title: body.title ?? url.hostname, text, sourceUrl: url.toString(), finalUrl: body.finalUrl ?? url.toString(), contentType: body.contentType ?? 'text/html', byteLength: Buffer.byteLength(text), providerName: 'crawl4ai', httpStatus: res.status, truncated: Buffer.byteLength(original) > profile.maxBytes };
  },
};
