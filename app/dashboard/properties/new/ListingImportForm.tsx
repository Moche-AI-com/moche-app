'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMPORT_ATTESTATION_TEXT } from '@/lib/property-import/attestation';
import { LISTING_THIN_HEADLINE, LISTING_THIN_NEXT_STEPS } from '@/lib/property-import/confidence';

const STAGES = ['Saving import job', 'Reading listing', 'Pulling out the details worth keeping', 'Creating draft property'];

/** Where each fallback path sends the host. Phase D's wizard reads `intent`. */
const STEP_HREF: Record<string, string> = {
  manual: '/dashboard/properties/new?manual=1#manual-setup',
  document: '/dashboard/properties/new?manual=1&intent=document#manual-setup',
  paste: '/dashboard/properties/new?manual=1&intent=paste#manual-setup',
};

export function ListingImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A gated link is not an error, it is an outcome. Rendering it in the red
  // alert slot would tell the host they did something wrong when the truth is
  // that the page had nothing useful on it.
  const [thin, setThin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setThin(null);
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter a public Airbnb or VRBO listing URL.');
      if (!attested) throw new Error('Confirm that you own or manage this listing before importing it.');
      setLoading(true);
      setStage(1);
      const response = await fetch('/api/property-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, attested: true }) });
      const payload = await response.json() as { jobId?: string; ok?: boolean; error?: string; verdict?: string };
      if (!payload.jobId) throw new Error(payload.error ?? 'Could not start that import.');
      if (payload.verdict === 'low_confidence' || payload.verdict === 'no_fields') {
        setThin(payload.error ?? LISTING_THIN_HEADLINE);
        return;
      }
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
        <p className="faint" style={{ fontSize: '.8rem', marginTop: '.4rem' }}>We pull out details like bedrooms, check-in time, and parking, and file each one where it belongs. Nothing enters the Brain until you approve it.</p>
      </div>
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
          We keep the listing URL and the text we read, so you can see where every imported detail came from and delete all of it in one step.
        </p>
      </div>
      {loading && <ol className="faint" aria-live="polite" style={{ margin: '.75rem 0', paddingLeft: '1.2rem' }}>{STAGES.map((item, index) => <li key={item}>{index <= stage ? item : 'Waiting'}</li>)}</ol>}
      {thin && (
        <div className="alert alert-info" role="status" data-testid="listing-thin-result" style={{ marginTop: '.75rem' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>{LISTING_THIN_HEADLINE}</p>
          <p className="faint" style={{ margin: '.35rem 0 .75rem' }}>Nothing was created and nothing was saved. Pick how you would rather set this up.</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.6rem' }}>
            {LISTING_THIN_NEXT_STEPS.map((step) => (
              <li key={step.key}>
                <Link href={STEP_HREF[step.key]} data-testid={`listing-thin-step-${step.key}`} style={{ fontWeight: 600 }}>{step.label}</Link>
                <span className="faint" style={{ display: 'block', fontSize: '.8rem' }}>{step.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={loading || !attested}>{loading ? 'Building property…' : 'Build my property'}</button>
    </form>
  );
}
