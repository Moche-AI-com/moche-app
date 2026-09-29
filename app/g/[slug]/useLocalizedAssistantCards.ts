'use client';

import { useEffect, useState } from 'react';
import { resolveLanguage } from '@/lib/guest/languages';
import type { CardCopy } from '@/lib/guest/card-copy';

type CardResult = { locale: string; cards: CardCopy[] };

/** Never display cards returned for a previous language choice. */
export function useLocalizedAssistantCards(slug: string, language: string | null | undefined, enabled: boolean) {
  const locale = resolveLanguage(language)?.code ?? 'auto';
  const [result, setResult] = useState<CardResult | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const cards = result?.locale === locale ? result.cards : [];

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError(false);
    fetch(`/api/guest/${encodeURIComponent(slug)}/assistant-cards?language=${encodeURIComponent(locale)}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Cards unavailable'); return response.json(); })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(json.cards)) throw new Error('Malformed cards');
        setResult({ locale, cards: json.cards });
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [slug, locale, enabled, retry]);

  return { cards, loading: enabled && !error && result?.locale !== locale, error, retry: () => setRetry((value) => value + 1) };
}
