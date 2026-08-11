import 'server-only';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import type { AcquisitionProvider, AcquisitionResult } from '../types';
import type { AcquisitionProfile } from '../profiles';

async function scrape(url: URL, profile: AcquisitionProfile, proxy: 'basic' | 'stealth', signal: AbortSignal): Promise<AcquisitionResult> {
  const res = await fetch(`${serverEnv.firecrawlBaseUrl.replace(/\/$/, '')}/v1/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${serverEnv.firecrawlApiKey}` },
    body: JSON.stringify({
      url: url.toString(), formats: ['markdown'], onlyMainContent: true, blockAds: true,
      removeBase64Images: true, proxy, waitFor: proxy === 'stealth' ? 3500 : 1200,
    }),
    signal,
  });
  if (!res.ok) {
    const error = new Error(`Firecrawl returned ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  const json = await res.json() as { data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } }; markdown?: string; metadata?: { title?: string } };
  const original = json.data?.markdown ?? json.markdown ?? '';
  const truncated = Buffer.byteLength(original, 'utf8') > profile.maxBytes;
  const text = Buffer.from(original, 'utf8').subarray(0, profile.maxBytes).toString('utf8').replace(/\s+\n/g, '\n').trim();
  return {
    title: json.data?.metadata?.title ?? json.metadata?.title ?? url.hostname,
    text,
    sourceUrl: url.toString(),
    finalUrl: json.data?.metadata?.sourceURL ?? url.toString(),
    contentType: 'text/markdown', byteLength: Buffer.byteLength(text, 'utf8'), providerName: 'firecrawl', httpStatus: res.status, truncated,
  };
}

export const firecrawlProvider: AcquisitionProvider = {
  name: 'firecrawl',
  supports: (profile) => Boolean(serverEnv.firecrawlApiKey) && (profile.renderJs || profile.useStealth),
  async fetch(url, profile, signal): Promise<AcquisitionResult> {
    try {
      const basic = await scrape(url, profile, 'basic', signal);
      if (basic.text.length >= profile.minTextLength || !profile.useStealth) return basic;
    } catch (error) {
      log.warn('firecrawl_basic_failed', { host: url.hostname, error: error instanceof Error ? error.message : 'unknown' });
    }
    if (!profile.useStealth) throw new Error('Firecrawl returned no readable text.');
    return scrape(url, profile, 'stealth', signal);
  },
};
