'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ImportedReviewGroup } from '@/lib/property-import/extract';
import { GapInterview } from './GapInterview';

export function ImportReviewClient({ jobId, propertyId, groups }: { jobId: string; propertyId: string; groups: ImportedReviewGroup[] }) {
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, { title: string; text: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function acceptGroup(group: ImportedReviewGroup) {
    setError(null); setWorking(group.key);
    const edited = edits[group.key] ?? { title: group.title, text: group.text };
    try {
      const response = await fetch(`/api/property-imports/${jobId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: group.key, ...edited }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Could not save this group.');
      setAccepted((current) => ({ ...current, [group.key]: true }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this group.'); }
    finally { setWorking(null); }
  }

  return <div style={{ display: 'grid', gap: '1rem', maxWidth: 820 }}>
    <p className="faint">Nothing was added to your Brain automatically. Review each group and accept only what is correct.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {groups.map((group) => {
      const edited = edits[group.key] ?? { title: group.title, text: group.text };
      return <details className="card" key={group.key} open style={{ padding: '1rem' }}>
        <summary style={{ cursor: 'pointer' }}><strong>{group.label}</strong></summary>
        <div style={{ marginTop: '.75rem' }}>
          <p className="faint" style={{ marginTop: 0 }}>From your Airbnb listing</p>
          {group.detected ? <>
            <label className="field"><span className="label">Title</span><input className="input" value={edited.title} onChange={(event) => setEdits((current) => ({ ...current, [group.key]: { ...edited, title: event.target.value } }))} /></label>
            <label className="field"><span className="label">Review and edit</span><textarea className="input" rows={6} value={edited.text} onChange={(event) => setEdits((current) => ({ ...current, [group.key]: { ...edited, text: event.target.value } }))} /></label>
            {accepted[group.key] ? <span className="badge">Added to Brain</span> : <button className="button" type="button" onClick={() => acceptGroup(group)} disabled={working !== null}>{working === group.key ? 'Saving…' : 'Accept'}</button>}
          </> : <p className="faint">No reliable details were detected here. Add these later when you have them.</p>}
        </div>
      </details>;
    })}
    <GapInterview jobId={jobId} />
    <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
      <Link className="button" href={`/dashboard/properties/${propertyId}`}>Continue to property</Link>
      <Link href={`/dashboard/properties/${propertyId}/appliances`}>Add appliances</Link>
    </div>
  </div>;
}
