'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, CheckCircle2, TriangleAlert } from 'lucide-react';

// Backlog P4-02: the create form takes an optional listing URL. Property
// creation must succeed immediately regardless of what happens to that URL, so
// the fetch does NOT run inside the create action (a slow or blocked listing
// site would otherwise stall or fail the whole creation). Instead the new
// property page picks the URL up once and imports it here, where a failure is
// an actionable state on screen rather than a silent gap.
//
// The import lands in the review queue, never straight into the Brain.

type State = 'running' | 'done' | 'failed';

export function ListingImportKickoff({ propertyId, listingUrl }: { propertyId: string; listingUrl: string }) {
  const [state, setState] = useState<State>('running');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}/ingest/url`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: listingUrl, category: 'core', visibility: 'guest_visible' }),
        });
        const json = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (cancelled) return;
        if (!res.ok) {
          setState('failed');
          setMessage(json?.error ?? 'We could not read that listing page.');
          return;
        }
        setState('done');
        setMessage(json?.message ?? 'Sent to your review queue.');
      } catch {
        if (cancelled) return;
        setState('failed');
        setMessage('We could not reach that listing page.');
      } finally {
        if (!cancelled) {
          // Drop the ?import= parameter so a refresh does not re-run the import.
          router.replace(`/dashboard/properties/${propertyId}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId, listingUrl, router]);

  const border = state === 'failed' ? 'var(--coral)' : state === 'done' ? 'var(--teal)' : 'var(--border)';

  return (
    <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderColor: border }} role="status">
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
        {state === 'running' && <LoaderCircle size={16} className="spin" aria-hidden />}
        {state === 'done' && <CheckCircle2 size={16} aria-hidden />}
        {state === 'failed' && <TriangleAlert size={16} aria-hidden />}
        <strong style={{ fontSize: '.9rem' }}>
          {state === 'running' && 'Reading your listing…'}
          {state === 'done' && 'Listing sent to your review queue'}
          {state === 'failed' && 'We could not import that listing'}
        </strong>
      </div>
      <p className="muted" style={{ fontSize: '.82rem', margin: '.4rem 0 0' }}>
        {state === 'running'
          ? 'This takes a few seconds. Your property is already created, so you can keep working.'
          : message}
      </p>
      {state === 'done' && (
        <Link href="/dashboard/updates" className="btn btn-sm btn-ghost" style={{ marginTop: '.6rem', minHeight: 44 }}>
          Review the draft
        </Link>
      )}
      {state === 'failed' && (
        <Link
          href={`/dashboard/properties/${propertyId}/brain`}
          className="btn btn-sm btn-ghost"
          style={{ marginTop: '.6rem', minHeight: 44 }}
        >
          Add the details yourself
        </Link>
      )}
    </div>
  );
}
