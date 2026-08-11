import 'server-only';
import { acquire, type AcquisitionResult } from '@/lib/acquisition';
import { isSsrfError } from '@/lib/net/ssrf';

/** @deprecated Use acquire() with an intent-named acquisition profile. */
export interface FetchedPage { title: string; text: string; sourceUrl: string; }

/** Backward-compatible listing acquisition entry point for existing callers. */
export async function fetchUrlContent(rawUrl: string): Promise<FetchedPage> {
  const result: AcquisitionResult = await acquire(rawUrl, 'listing_public_v1');
  return { title: result.title, text: result.text, sourceUrl: result.finalUrl };
}

export { isSsrfError };
