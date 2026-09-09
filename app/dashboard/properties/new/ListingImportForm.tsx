'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMPORT_ATTESTATION_TEXT } from '@/lib/property-import/attestation';
import { MIN_PASTED_TEXT } from '@/lib/property-import/pasted';

const STAGES = ['Saving import job', 'Reading listing', 'Organizing review groups', 'Creating draft property'];

// Paste-text-first (issue #133): pasting the listing's own text is the reliable
// path — booking platforms actively fight scrapers, so the link import stays as
// a convenience ("we'll do our best") and is never a dependency.
export function ListingImportForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'paste' | 'url'>('paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (!attested) throw new Error('Confirm that you own or manage this listing before importing it.');
      let body: { text?: string; url?: string; attested: true };
      if (mode === 'paste') {
        const trimmed = text.trim();
        if (trimmed.length < MIN_PASTED_TEXT) {
          throw new Error(`Paste the full listing text — at least ${MIN_PASTED_TEXT} characters (description, amenities, rules, check-in details).`);
        }
        body = { text: trimmed, attested: true };
      } else {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a public Airbnb or VRBO listing URL.');
        body = { url, attested: true };
      }
      setLoading(true);
      setStage(1);
      const response = await fetch('/api/property-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json() as { jobId?: string; ok?: boolean; error?: string };
      if (!payload.jobId) throw new Error(payload.error ?? 'Could not start that import.');
      setStage(3);
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Could not import that listing.');
      router.push(`/dashboard/properties/new/review/${payload.jobId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not import that listing.');
    } finally {
      setLoading(false);
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '.5rem .9rem',
    borderRadius: 8,
    border: '1px solid',
    borderColor: active ? 'currentColor' : 'transparent',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    background: 'none',
    fontSize: '.9rem',
  });

  return (
    <form onSubmit={submit} className="card" style={{ padding: '1.5rem', maxWidth: 680 }} aria-busy={loading}>
      <div role="tablist" aria-label="Import method" style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <button type="button" role="tab" aria-selected={mode === 'paste'} style={tabStyle(mode === 'paste')} onClick={() => setMode('paste')}>
          Paste listing text
        </button>
        <button type="button" role="tab" aria-selected={mode === 'url'} style={tabStyle(mode === 'url')} onClick={() => setMode('url')}>
          Use a listing link
        </button>
      </div>

      {mode === 'paste' ? (
        <div className="field">
          <label className="label" htmlFor="listingText">Paste your listing text</label>
          <textarea
            className="input"
            id="listingText"
            name="listingText"
            required
            minLength={MIN_PASTED_TEXT}
            maxLength={60000}
            rows={10}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Open your Airbnb or Vrbo listing, select all the text (title, description, amenities, house rules, check-in instructions), and paste it here."
            style={{ minHeight: 160, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <p className="faint" style={{ fontSize: '.8rem', marginTop: '.4rem' }}>
            The reliable path — platforms block scrapers, but your own listing text always works. We organize it into review groups; nothing enters the Brain until you approve it.
          </p>
        </div>
      ) : (
        <div className="field">
          <label className="label" htmlFor="listingUrl">Paste an Airbnb or VRBO listing URL</label>
          <input className="input" id="listingUrl" name="listingUrl" type="url" inputMode="url" required maxLength={2000} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.airbnb.com/rooms/…" style={{ minHeight: 44 }} />
          <p className="faint" style={{ fontSize: '.8rem', marginTop: '.4rem' }}>
            We will do our best to read it — platforms sometimes block automated reads. If it fails, paste the listing text instead.
          </p>
        </div>
      )}

      <div className="field">
        <label style={{ display: 'flex', gap: '.55rem', alignItems: 'flex-start', fontSize: '.85rem', lineHeight: 1.45 }}>
          <input
            type="checkbox"
            name="attested"
            checked={attested}
            onChange={(event) => setAttested(event.target.checked)}
            required
            style={{ marginTop: '.2rem', width: 18, height: 18, flexShrink: 0 }}
          />
          <span>{IMPORT_ATTESTATION_TEXT}</span>
        </label>
        <p className="faint" style={{ fontSize: '.75rem', marginTop: '.4rem' }}>
          We keep the source text we read, so you can see where every imported detail came from and delete all of it in one step.
        </p>
      </div>
      {loading && <ol className="faint" aria-live="polite" style={{ margin: '.75rem 0', paddingLeft: '1.2rem' }}>{STAGES.map((item, index) => <li key={item}>{index <= stage ? item : 'Waiting'}</li>)}</ol>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="button" type="submit" disabled={loading || !attested}>{loading ? 'Building property…' : 'Build my property'}</button>
    </form>
  );
}
