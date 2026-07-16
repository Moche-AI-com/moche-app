'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function IngestPanel({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'doc' | 'url'>('doc');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function uploadDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/ingest/document`, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setMsg({ kind: 'ok', text: `Ingested "${json.title}" into ${json.chunks} chunk(s).` });
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setBusy(false);
    }
  }

  async function ingestUrl(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/ingest/url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not fetch that URL');
      setMsg({ kind: 'ok', text: `Imported "${json.title}" into ${json.chunks} chunk(s).` });
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not fetch that URL' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '.75rem' }}>Import knowledge</h3>
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.9rem' }}>
        <button className={`btn btn-sm ${tab === 'doc' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('doc')}>Document</button>
        <button className={`btn btn-sm ${tab === 'url' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('url')}>URL</button>
      </div>

      {msg && <div className={`alert ${msg.kind === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ fontSize: '.8rem', marginBottom: '.75rem' }}>{msg.text}</div>}

      {tab === 'doc' ? (
        <form onSubmit={uploadDoc}>
          <div className="field">
            <input className="input" type="file" name="file" accept=".pdf,.txt,.md,.docx" required data-testid="input-doc-file" />
          </div>
          <div className="field">
            <select className="select" name="category" defaultValue="documents">
              <option value="documents">Documents</option>
              <option value="core">Core</option>
              <option value="appliances">Appliances</option>
              <option value="house_rules">House Rules</option>
              <option value="local_recommendations">Local Recommendations</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block btn-sm" disabled={busy}>{busy ? 'Uploading…' : 'Upload & index'}</button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>PDF, TXT, MD, or DOCX. Max 25 MB.</p>
        </form>
      ) : (
        <form onSubmit={ingestUrl}>
          <div className="field">
            <input className="input" type="url" name="url" placeholder="https://…" required data-testid="input-url" />
          </div>
          <div className="field">
            <input className="input" name="title" placeholder="Title (optional)" maxLength={200} />
          </div>
          <div className="field">
            <select className="select" name="category" defaultValue="product_urls">
              <option value="product_urls">Product / Appliance URL</option>
              <option value="local_recommendations">Local Recommendation</option>
              <option value="appliances">Appliance Manual</option>
              <option value="documents">Reference</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block btn-sm" disabled={busy}>{busy ? 'Fetching…' : 'Fetch & index'}</button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>We fetch page text server-side and treat it as reference data only.</p>
        </form>
      )}
    </div>
  );
}
