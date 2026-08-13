'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ImportedReviewGroup } from '@/lib/property-import/extract';
import type { ExtractedField } from '@/lib/property-import/fields';
import { GapInterview } from './GapInterview';
import { ImportFieldList } from './ImportFieldList';

export function ImportReviewClient({ jobId, propertyId, fields, groups }: { jobId: string; propertyId: string; fields: ExtractedField[]; groups: ImportedReviewGroup[] }) {
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

  const detectedGroups = groups.filter((group) => group.detected);

  return <div style={{ display: 'grid', gap: '1rem', maxWidth: 820 }}>
    <p className="faint">Nothing was added to your Brain automatically. Accept only what is correct.</p>
    <ImportFieldList jobId={jobId} fields={fields} />
    {error && <p role="alert" className="alert alert-error">{error}</p>}
    {/* Collapsed and secondary. These are sentences we recognized as being about a
        topic, not facts we mapped to a field, so they belong behind a disclosure
        rather than competing with the structured list above for the host's
        attention. Hidden entirely when nothing was detected: five boxes each
        saying "nothing found" is noise that reads as a broken import. */}
    {detectedGroups.length > 0 && <details className="card" style={{ padding: '1rem' }}>
      <summary style={{ cursor: 'pointer' }}><strong>Listing notes (optional)</strong> <span className="faint">— longer passages we did not map to a specific field</span></summary>
      <div style={{ marginTop: '.75rem', display: 'grid', gap: '.75rem' }}>
    {detectedGroups.map((group) => {
      const edited = edits[group.key] ?? { title: group.title, text: group.text };
      return <div className="card-2" key={group.key} style={{ padding: '1rem' }}>
        <strong>{group.label}</strong>
        <div style={{ marginTop: '.75rem' }}>
          <p className="faint" style={{ marginTop: 0 }}>Read from your listing page</p>
          <>
            <label className="field"><span className="label">Title</span><input className="input" value={edited.title} onChange={(event) => setEdits((current) => ({ ...current, [group.key]: { ...edited, title: event.target.value } }))} /></label>
            <label className="field"><span className="label">Review and edit</span><textarea className="input" rows={6} value={edited.text} onChange={(event) => setEdits((current) => ({ ...current, [group.key]: { ...edited, text: event.target.value } }))} /></label>
            {accepted[group.key] ? <span className="badge">Added to Brain</span> : <button className="btn btn-primary" type="button" onClick={() => acceptGroup(group)} disabled={working !== null}>{working === group.key ? 'Saving…' : 'Accept'}</button>}
          </>
        </div>
      </div>;
    })}
      </div>
    </details>}
    <GapInterview jobId={jobId} />
    <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
      <Link className="btn btn-primary" href={`/dashboard/properties/${propertyId}`}>Continue to property</Link>
      <Link href={`/dashboard/properties/${propertyId}/appliances`}>Add appliances</Link>
    </div>
  </div>;
}
