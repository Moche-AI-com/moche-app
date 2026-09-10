import type { FetchedPage } from '@/lib/ingest/firecrawl';

// Paste-text-first import (issue #133, item 3). Listing-link crawling is a
// convenience, never a dependency: booking platforms actively fight scraping, so
// the reliable path is the host pasting their own listing text. This module turns
// pasted text into the same FetchedPage shape the crawl produces, so both paths
// share one extraction, gating, and review pipeline.

export const PASTED_SOURCE_URL = 'pasted://listing-text';
export const PASTED_PROVIDER = 'manual_paste';

export const MIN_PASTED_TEXT = 600;
export const MAX_PASTED_TEXT = 60000;

// Derive a working title from the first meaningful line of the paste. Listing
// copy usually opens with the title ("Cozy 2BR cabin steps from the lake").
export function derivePastedTitle(text: string): string {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length >= 8);
  return (firstLine ?? '').slice(0, 160) || 'Pasted listing details';
}

export function buildPastedPage(pastedText: string): FetchedPage {
  return {
    title: derivePastedTitle(pastedText),
    text: pastedText,
    sourceUrl: PASTED_SOURCE_URL,
  };
}
