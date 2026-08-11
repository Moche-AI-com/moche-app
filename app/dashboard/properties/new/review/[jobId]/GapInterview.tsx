'use client';

import { useState } from 'react';

type Gap = { requirementKey: string; label: string; why: string };

export function GapInterview({ jobId }: { jobId: string }) {
  const [gaps, setGaps] = useState<Gap[] | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = gaps?.[0];

  async function checkGaps() {
    setLoading(true); setError(null);
    try { const response = await fetch(`/api/property-imports/${jobId}/gaps`); const result = await response.json() as { gaps?: Gap[]; error?: string }; if (!response.ok) throw new Error(result.error ?? 'Could not check readiness.'); setGaps(result.gaps ?? []); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not check readiness.'); } finally { setLoading(false); }
  }
  async function submit() {
    if (!current) return; setLoading(true); setError(null);
    try { const response = await fetch(`/api/property-imports/${jobId}/gaps`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requirementKey: current.requirementKey, answer }) }); const result = await response.json() as { ok?: boolean; error?: string }; if (!response.ok || !result.ok) throw new Error(result.error ?? 'Could not save that answer.'); setGaps((items) => items ? items.slice(1) : []); setAnswer(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save that answer.'); } finally { setLoading(false); }
  }

  if (gaps === null) return <button className="button secondary" type="button" onClick={checkGaps} disabled={loading}>{loading ? 'Checking gaps…' : 'Check remaining setup gaps'}</button>;
  if (!current) return <p className="success">No blocking setup gaps remain. You can continue to your property.</p>;
  return <section className="card" style={{ padding: '1rem' }}><p className="faint" style={{ marginTop: 0 }}>One last question, only because this is still needed for guest readiness.</p><h2 style={{ fontSize: '1.05rem' }}>{current.label}</h2><p>{current.why}</p><textarea className="input" rows={5} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write the guest-facing detail you want saved…" /><div style={{ display: 'flex', gap: '.75rem', marginTop: '.75rem' }}><button className="button" type="button" disabled={loading || answer.trim().length < 20} onClick={submit}>{loading ? 'Saving…' : 'Save answer'}</button><button className="button secondary" type="button" onClick={() => setGaps((items) => items ? items.slice(1) : [])}>Skip for now</button></div>{error && <p role="alert" className="error">{error}</p>}</section>;
}
