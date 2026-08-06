'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BRAIN_CATEGORY_LABELS, type BrainCategory } from '@/lib/constants';

type FiledItem = { category: BrainCategory; title: string; brainItemId: string };
type IngestResponse = {
  error?: string;
  message?: string;
  title?: string;
  chunks?: number;
  autofilled?: boolean;
  filed?: FiledItem[];
};

function sectionBreakdown(filed: FiledItem[]): string {
  const counts = new Map<BrainCategory, number>();
  for (const item of filed) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => `${count} in ${BRAIN_CATEGORY_LABELS[category]}`)
    .join(' · ');
}

export function IngestPanel({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'doc' | 'url' | 'paste'>('doc');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [filed, setFiled] = useState<FiledItem[] | null>(null);

  function recordResponse(json: IngestResponse, defaultMessage: string) {
    setFiled(json.autofilled && Array.isArray(json.filed) ? json.filed : null);
    setMsg({ kind: 'ok', text: json.message ?? defaultMessage });
  }

  async function uploadDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMsg(null);
    setFiled(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/ingest/document`, { method: 'POST', body: fd });
      const json = await res.json() as IngestResponse;
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      recordResponse(json, `Imported "${json.title}".`);
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
    setFiled(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/ingest/url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as IngestResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not fetch that URL');
      recordResponse(json, json.message ?? `"${json.title}" was imported.`);
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not fetch that URL' });
    } finally {
      setBusy(false);
    }
  }

  async function ingestPaste(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setMsg(null);
    setFiled(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/ingest/text`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as IngestResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not save that text');
      recordResponse(json, `Imported "${json.title}".`);
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not save that text' });
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
        <button className={`btn btn-sm ${tab === 'paste' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('paste')}>Paste</button>
      </div>

      {msg && <div className={`alert ${msg.kind === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ fontSize: '.8rem', marginBottom: '.75rem' }}>{msg.text}</div>}
      {filed && (
        <div className="card alert alert-success" style={{ padding: '1rem', marginBottom: '.75rem' }} role="status">
          <strong>Your Brain is set up</strong>
          <p className="muted" style={{ fontSize: '.8rem', margin: '.4rem 0 0' }}>{sectionBreakdown(filed)}</p>
          <Link href={`/dashboard/properties/${propertyId}/brain`} className="btn btn-primary" style={{ marginTop: '.75rem', minHeight: 44 }}>
            Review &amp; manage your Brain
          </Link>
        </div>
      )}

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
      ) : tab === 'url' ? (
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
          <button className="btn btn-primary btn-block btn-sm" disabled={busy}>{busy ? 'Fetching…' : 'Fetch details'}</button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>We read the page server-side and organize its details. Some sites (e.g. Zillow) block automated fetches, so use Paste if a URL fails.</p>
        </form>
      ) : (
        <form onSubmit={ingestPaste}>
          <div className="field">
            <textarea className="input" name="text" rows={7} required minLength={20} maxLength={50000} placeholder="Paste the listing details, house manual, or any notes here. We'll clean and organize it automatically." data-testid="input-paste" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div className="field">
            <input className="input" name="title" placeholder="Title (optional)" maxLength={200} />
          </div>
          <div className="field">
            <select className="select" name="category" defaultValue="core">
              <option value="core">Core</option>
              <option value="local_recommendations">Local Recommendations</option>
              <option value="house_rules">House Rules</option>
              <option value="appliances">Appliances</option>
              <option value="checkin_checkout">Check-in / Check-out</option>
              <option value="documents">Reference</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block btn-sm" disabled={busy}>{busy ? 'Cleaning…' : 'Clean & index'}</button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>Best for blocked sites like Zillow: open the listing, copy the details, paste here. We structure it into a clean summary before indexing.</p>
        </form>
      )}
    </div>
  );
}
