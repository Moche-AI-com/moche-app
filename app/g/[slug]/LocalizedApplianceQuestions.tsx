'use client';

import { useEffect, useState } from 'react';
import { resolveLanguage } from '@/lib/guest/languages';
import type { PortalT } from '@/lib/guest/portal-strings';

type Question = { id: string; text: string };

export function LocalizedApplianceQuestions(props: {
  slug: string; applianceId: string; original: Question[]; language: string | null | undefined;
  hostPreview: boolean; busy: boolean; t: PortalT; onAsk: (question: string) => void; onSessionExpired: () => void;
}) {
  const locale = resolveLanguage(props.language)?.code ?? 'auto';
  const key = `${props.applianceId}:${locale}`;
  const [result, setResult] = useState<{ key: string; questions: Question[] } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (props.hostPreview) return;
    const controller = new AbortController();
    setError(false);
    fetch(`/api/guest/${encodeURIComponent(props.slug)}/appliances/${encodeURIComponent(props.applianceId)}/questions?language=${encodeURIComponent(locale)}`, {
      cache: 'no-store', signal: controller.signal,
    }).then((res) => {
      if (res.status === 401) { props.onSessionExpired(); throw new Error('Session expired'); }
      if (!res.ok) throw new Error('Questions unavailable');
      return res.json();
    }).then((json) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(json.questions) || !json.questions.every((q: Question) => typeof q.id === 'string' && typeof q.text === 'string')) throw new Error('Malformed questions');
      setResult({ key, questions: json.questions });
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [props.slug, props.applianceId, props.hostPreview, props.onSessionExpired, locale, key, retry]);
  const questions = props.hostPreview ? props.original : result?.key === key ? result.questions : null;
  if (!questions) return error
    ? <p role="alert" className="gp-alert-text">{props.t('askError')} <button type="button" className="gp-msg-link" onClick={() => setRetry((n) => n + 1)}>{props.t('askApplianceLoad')}</button></p>
    : <p className="gp-muted" role="status">{props.t('askApplianceLoad')}</p>;
  if (questions.length === 0) return <p className="gp-muted">{props.t('askTitle')}</p>;
  return <div className="gp-prompt-list">{questions.map((item) => <button key={item.id} type="button" className="gp-prompt-item" disabled={props.busy} onClick={() => props.onAsk(item.text)}>{item.text}</button>)}</div>;
}
