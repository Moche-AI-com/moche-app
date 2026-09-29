'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveLanguage } from '@/lib/guest/languages';
import type { CardCopy } from '@/lib/guest/card-copy';

type CardResult = { slug: string; cards: CardCopy[] };

/** Keep rendered cards mounted while replacing only their translated text. */
export function useLocalizedAssistantCards(slug: string, language: string | null | undefined, enabled: boolean) {
  const locale = resolveLanguage(language)?.code ?? 'auto';
  const cacheKey = `${slug}:${locale}`;
  const cache = useRef(new Map<string, CardCopy[]>());
  const [result, setResult] = useState<CardResult | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cachedCards = cache.current.get(cacheKey);
  const cards = cachedCards ?? (result?.slug === slug ? result.cards : []);

  useEffect(() => {
    if (!enabled) return;
    if (cachedCards) { setError(false); return; }
    const controller = new AbortController();
    setError(false);
    fetch(`/api/guest/${encodeURIComponent(slug)}/assistant-cards?language=${encodeURIComponent(locale)}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Cards unavailable'); return response.json(); })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(json.cards)) throw new Error('Malformed cards');
        cache.current.set(cacheKey, json.cards);
        setResult({ slug, cards: json.cards });
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [slug, locale, enabled, cacheKey, cachedCards, retryCount]);

  return { cards, loading: enabled && !error && !cachedCards, error, retry: () => setRetryCount((value) => value + 1) };
}
