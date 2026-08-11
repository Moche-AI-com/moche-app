'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STAGES = ['Saving import job', 'Reading listing', 'Organizing review groups', 'Creating draft property'];

export function ListingImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a public Airbnb or VRBO listing URL.');
      setLoading(true);
      setStage(1);
      const response = await fetch('/api/property-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
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

  return (
    <form onSubmit={submit} className="card" style={{ padding: '1.5rem', maxWidth: 680 }} aria-busy={loading}>
      <div className="field">
        <label className="label" htmlFor="listingUrl">Paste an Airbnb or VRBO listing URL</label>
        <input className="input" id="listingUrl" name="listingUrl" type="url" inputMode="url" required maxLength={2000} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.airbnb.com/rooms/…" style={{ minHeight: 44 }} />
        <p className="faint" style={{ fontSize: '.8rem', marginTop: '.4rem' }}>We organize listing details into review groups. Nothing enters the Brain until you approve it.</p>
      </div>
      {loading && <ol className="faint" aria-live="polite" style={{ margin: '.75rem 0', paddingLeft: '1.2rem' }}>{STAGES.map((item, index) => <li key={item}>{index <= stage ? item : 'Waiting'}</li>)}</ol>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="button" type="submit" disabled={loading}>{loading ? 'Building property…' : 'Build my property'}</button>
    </form>
  );
}
