'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Globe, Search, X } from 'lucide-react';
import { resolveLanguage, searchLanguages } from '@/lib/guest/languages';

// The portal's language picker (the header Globe). The guest picks their
// language once; the choice rides with every concierge chat and host-chat
// request, so the AI replies in it and the host receives an auto-translation.
// "Automatic" (the default) means: answer in whatever language the guest
// writes in. The list, search, and labels come from lib/guest/languages — the
// single canonical source shared with the server routes.
export function LanguagePicker(props: {
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = resolveLanguage(props.value);
  const results = useMemo(() => searchLanguages(query), [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const label = selected ? `Language: ${selected.label}` : 'Choose your language';

  return (
    <>
      <button
        type="button"
        className="gp-icon-btn"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        aria-label={label}
        title={label}
      >
        <Globe size={17} aria-hidden />
      </button>

      {open && (
        <div className="gp-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="gp-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose your language"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="gp-modal-head">
              <span className="gp-modal-title">
                <Globe size={16} aria-hidden /> Language
              </span>
              <button type="button" className="gp-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="gp-modal-body">
              <p className="gp-modal-sub">
                The concierge replies in your language, and your host receives a translation of your messages.
              </p>
              <div className="gp-picker-search" style={{ position: 'relative' }}>
                <Search
                  size={15}
                  aria-hidden
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gp-faint)' }}
                />
                <input
                  className="gp-input"
                  style={{ paddingLeft: 34 }}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search languages…"
                  aria-label="Search languages"
                />
              </div>
              <div className="gp-picker-list">
                <button
                  type="button"
                  className="gp-picker-item"
                  onClick={() => {
                    props.onChange(null);
                    setOpen(false);
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <span className="gp-picker-item-title">Automatic</span>
                    <span className="gp-picker-item-sub">Match the language I write in</span>
                  </span>
                  {!selected && <Check size={16} aria-hidden style={{ color: 'var(--gp-icon)' }} />}
                </button>
                {results.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    className="gp-picker-item"
                    onClick={() => {
                      props.onChange(lang.code);
                      setOpen(false);
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      <span className="gp-picker-item-title">{lang.nativeLabel}</span>
                      {lang.nativeLabel !== lang.label ? (
                        <span className="gp-picker-item-sub">{lang.label}</span>
                      ) : null}
                    </span>
                    {selected?.code === lang.code && <Check size={16} aria-hidden style={{ color: 'var(--gp-icon)' }} />}
                  </button>
                ))}
                {results.length === 0 && <p className="gp-muted">No languages match “{query}”.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
