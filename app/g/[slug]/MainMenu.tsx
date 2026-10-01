'use client';

import { useEffect, useState } from 'react';
import type { PortalStep } from './GuestPortal';
import type { PortalT } from '@/lib/guest/portal-strings';
import { PORTAL_STRING_LOCALES } from '@/lib/guest/portal-strings';
import { resolveLanguage } from '@/lib/guest/languages';
import { CardArt } from './CardArt';
import { ReviewNudge } from './ReviewNudge';
import { ShareStay } from './ShareStay';

type MenuKey = Extract<PortalStep, 'ask' | 'host' | 'maintenance' | 'extras'>;

export function MainMenu(props: { propertyName: string; guestName: string | null; hostPreview: boolean; slug?: string; language?: string | null; t: PortalT; onSelect: (key: MenuKey) => void; onPreviewSignIn: () => void }) {
  const { t } = props;
  const [requested, setRequested] = useState<string | null>(props.language ?? null);
  const [translated, setTranslated] = useState<{ language: string; menu: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const code = resolveLanguage(requested)?.code.toLowerCase();
  const needsRemote = !props.hostPreview && !!code && !PORTAL_STRING_LOCALES.includes(code);
  const menu = translated && translated.language.toLowerCase() === code ? translated.menu : null;

  useEffect(() => {
    if (props.hostPreview) return;
    let selected: string | null = props.language ?? null;
    if (!selected) { try { selected = window.localStorage.getItem('gp-lang'); } catch { /* storage can be disabled */ } }
    const resolved = resolveLanguage(selected)?.code ?? null;
    setRequested(resolved);
    if (!resolved || PORTAL_STRING_LOCALES.includes(resolved.toLowerCase())) { setLoading(false); setFailed(false); return; }
    const slug = props.slug ?? window.location.pathname.split('/')[2];
    if (!slug) { setFailed(true); return; }
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    fetch(`/api/guest/${encodeURIComponent(slug)}/assistant-cards?language=${encodeURIComponent(resolved)}`, { cache: 'no-store', signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error('Menu copy unavailable'); return res.json(); })
      .then((json) => { if (!controller.signal.aborted && json.menu && typeof json.menu === 'object') setTranslated({ language: resolved, menu: json.menu }); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [props.hostPreview, props.language, props.slug, t, retry]);

  const text = (key: string) => menu?.[key] ?? t(key);
  const cards: { key: MenuKey; title: string; blurb: string }[] = [
    { key: 'ask', title: text('cardAskTitle'), blurb: text('cardAskBlurb') },
    { key: 'host', title: text('cardHostTitle'), blurb: text('cardHostBlurb') },
    { key: 'maintenance', title: text('cardMaintTitle'), blurb: text('cardMaintBlurb') },
    { key: 'extras', title: text('cardExtrasTitle'), blurb: text('cardExtrasBlurb') },
  ];
  return <section aria-label="Main menu">
    <h1 className="gp-step-title">{props.guestName ? t('menuWelcomeName', { name: props.guestName }) : t('menuWelcome')}</h1>
    <p className="gp-step-sub">{t('menuSub', { property: props.propertyName })}</p>
    {props.hostPreview ? <div style={{ marginBottom: '1rem' }}><div className="gp-banner gp-banner-host" role="note">{t('menuHostPreview')}</div><button type="button" className="gp-msg-link" onClick={props.onPreviewSignIn} data-testid="button-preview-signin-flow">{t('menuPreviewSignIn')}</button></div> : null}
    {needsRemote && !menu ? <div role="status" className="gp-muted">{loading ? t('loading') : failed ? <button type="button" className="gp-msg-link" onClick={() => setRetry((value) => value + 1)}>{t('askError')}</button> : t('loading')}</div>
      : <div className="gp-menu-grid">{cards.map(({ key, title, blurb }, index) => <button key={key} type="button" className="gp-menu-card" style={{ animationDelay: `${index * 70}ms` }} onClick={() => props.onSelect(key)} data-testid={`menu-${key}`}><CardArt cardKey={key} /><span className="gp-menu-title">{title}</span><span className="gp-menu-blurb">{blurb}</span></button>)}</div>}
    {!props.hostPreview && <div style={{ margin: '1rem 0', textAlign: 'center' }}><ShareStay slug={props.slug} /></div>}
    {!props.hostPreview && <ReviewNudge propertyName={props.propertyName} onContactHost={() => props.onSelect('host')} />}
  </section>;
}
