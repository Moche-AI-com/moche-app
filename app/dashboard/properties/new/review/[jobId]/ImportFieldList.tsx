'use client';

import { useState } from 'react';
import type { ExtractedField } from '@/lib/property-import/fields';

// The primary review surface for a listing import (directive §1).
//
// One row per extracted field, showing four things the host needs in order to
// decide in a second: what it is, where it will be filed, how sure we are, and
// the sentence we read it from. The evidence snippet is the part that makes this
// reviewable rather than a leap of faith — without it, "Check-in time: 16:00" is
// a claim the host has to go verify on their own listing.

function confidenceLabel(value: number): { label: string; tone: string } {
  if (value >= 0.85) return { label: 'Clear', tone: 'var(--teal)' };
  if (value >= 0.6) return { label: 'Likely', tone: 'var(--text-muted)' };
  return { label: 'Worth checking', tone: 'var(--coral)' };
}

/** Composed brain_item values edit as a paragraph; scalars edit as one line. */
function initialEdit(field: ExtractedField): string {
  if (typeof field.value === 'object' && field.value !== null) {
    return (field.value as { text: string }).text;
  }
  return String(field.value);
}

export function ImportFieldList({ jobId, fields }: { jobId: string; fields: ExtractedField[] }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept(field: ExtractedField) {
    setError(null);
    setWorking(field.key);
    try {
      const response = await fetch(`/api/property-imports/${jobId}/fields`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: field.key, value: edits[field.key] ?? initialEdit(field) }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Could not save this detail.');
      setSaved((current) => ({ ...current, [field.key]: true }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this detail.');
    } finally {
      setWorking(null);
    }
  }

  if (fields.length === 0) {
    return <p className="faint" data-testid="import-fields-empty">We could not pull any structured details from this listing. Use Enhance Brain on the property to fill these in.</p>;
  }

  const remaining = fields.filter((f) => !saved[f.key] && !skipped[f.key]).length;

  return (
    <section style={{ display: 'grid', gap: '.75rem' }} data-testid="import-field-list">
      <p className="faint" style={{ margin: 0 }}>
        {remaining === 0 ? 'You have reviewed every detail we found.' : `${remaining} detail${remaining === 1 ? '' : 's'} left to review. Each one is filed where guests will look for it.`}
      </p>
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      {fields.map((field) => {
        const conf = confidenceLabel(field.confidence);
        const value = edits[field.key] ?? initialEdit(field);
        const isLong = typeof field.value === 'object' && field.value !== null;
        const done = saved[field.key];
        const passed = skipped[field.key];
        return (
          <article className="card" key={field.key} data-testid={`import-field-${field.key}`} style={{ padding: '1rem', opacity: passed ? 0.55 : 1 }}>
            <header style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{field.label}</strong>
              <span className="faint" style={{ fontSize: '.8rem' }}>files under {field.sectionLabel}</span>
              <span style={{ fontSize: '.75rem', color: conf.tone, marginLeft: 'auto' }}>{conf.label}</span>
            </header>
            {isLong
              ? <label className="field"><span className="label">Value</span><textarea className="input" rows={4} value={value} disabled={done} onChange={(event) => setEdits((current) => ({ ...current, [field.key]: event.target.value }))} /></label>
              : <label className="field"><span className="label">Value</span><input className="input" value={value} disabled={done} style={{ minHeight: 44 }} onChange={(event) => setEdits((current) => ({ ...current, [field.key]: event.target.value }))} /></label>}
            {field.evidence && (
              <p className="faint" style={{ fontSize: '.78rem', margin: '0 0 .6rem', borderLeft: '2px solid var(--border-strong)', paddingLeft: '.6rem' }}>
                Read from your listing: “{field.evidence}”
              </p>
            )}
            {done
              ? <span className="badge">Saved to Brain</span>
              : passed
                ? <button className="btn btn-ghost" type="button" onClick={() => setSkipped((c) => ({ ...c, [field.key]: false }))}>Undo skip</button>
                : <div style={{ display: 'flex', gap: '.6rem' }}>
                    <button className="btn btn-primary" type="button" disabled={working !== null} onClick={() => accept(field)}>{working === field.key ? 'Saving…' : 'Looks right'}</button>
                    <button className="btn btn-ghost" type="button" disabled={working !== null} onClick={() => setSkipped((c) => ({ ...c, [field.key]: true }))}>Skip</button>
                  </div>}
          </article>
        );
      })}
    </section>
  );
}
