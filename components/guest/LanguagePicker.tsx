'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Globe, Search, X } from 'lucide-react';
import { resolveLanguage, searchLanguages } from '@/lib/guest/languages';
import { PORTAL_STRING_LOCALES, portalT, type PortalT } from '@/lib/guest/portal-strings';

export function LanguagePicker(props: {
  value: string | null;
  onChange: (code: string | null) => void;
  t?: PortalT;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const resolved = resolveLanguage(props.value);
  const selected = resolved && PORTAL_STRING_LOCALES.includes(resolved.code.toLowerCase()) ? resolved : null;
  const results = useMemo(() => searchLanguages(query).filter((lang) => PORTAL_STRING_LOCALES.includes(lang.code.toLowerCase())), [query]);
  const t = props.t ?? portalT(null);

  useEffect(() => {
    if (resolved && !selected) props.onChange(null);
  }, [resolved, selected, props.onChange]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const label = selected ? t('langCurrent', { label: selected.label }) : t('langChoose');

  return (
    <>
      <button type="button" className="gp-icon-btn" onClick={() => { setQuery(''); setOpen(true); }} aria-label={label} title={label}>
        <Globe size={17} aria-hidden />
      </button>
      {open && (
        <div className="gp-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="gp-modal" role="dialog" aria-modal="true" aria-label={t('langChoose')} onClick={(event) => event.stopPropagation()}>
            <div className="gp-modal-head">
              <span className="gp-modal-title"><Globe size={16} aria-hidden /> {t('langTitle')}</span>
              <button type="button" className="gp-icon-btn" onClick={() => setOpen(false)} aria-label={t('close')}><X size={16} aria-hidden /></button>
            </div>
            <div className="gp-modal-body">
              <p className="gp-modal-sub">{t('langSub')}</p>
              <div className="gp-picker-search" style={{ position: 'relative' }}>
                <Search size={15} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gp-faint)' }} />
                <input className="gp-input" style={{ paddingLeft: 34 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('langSearch')} aria-label={t('langSearch')} />
              </div>
              <div className="gp-picker-list">
                <button type="button" className="gp-picker-item" onClick={() => { props.onChange(null); setOpen(false); }}>
                  <span style={{ flex: 1 }}><span className="gp-picker-item-title">{t('langAuto')}</span><span className="gp-picker-item-sub">{t('langAutoSub')}</span></span>
                  {!selected && <Check size={16} aria-hidden style={{ color: 'var(--gp-icon)' }} />}
                </button>
                {results.map((lang) => (
                  <button key={lang.code} type="button" className="gp-picker-item" onClick={() => { props.onChange(lang.code); setOpen(false); }}>
                    <span style={{ flex: 1 }}><span className="gp-picker-item-title">{lang.nativeLabel}</span>{lang.nativeLabel !== lang.label ? <span className="gp-picker-item-sub">{lang.label}</span> : null}</span>
                    {selected?.code === lang.code && <Check size={16} aria-hidden style={{ color: 'var(--gp-icon)' }} />}
                  </button>
                ))}
                {results.length === 0 && <p className="gp-muted">{t('langNoMatch', { query })}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
