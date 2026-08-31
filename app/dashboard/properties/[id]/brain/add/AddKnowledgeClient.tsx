'use client';

// Client half of the unified Add-knowledge surface (slice 3).
//
// Write mode keeps title/body in controlled state so "Improve with AI" can rewrite the
// draft in place; the rewrite is propose-only and the host still presses Add to Brain.
// Upload / URL / Paste post to the same ingest routes the Import panel uses today.

import { useEffect, useState, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { saveBrainItemAction } from '../actions';
import { improveBrainDraftAction } from './improve-action';
import { featureSectionId } from '@/lib/brain/taxonomy';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export type AddSection = { value: string; label: string; blurb: string };
export type AddFeature = { id: string; label: string };

type Tab = 'write' | 'upload' | 'url' | 'paste';

type IngestResponse = {
  error?: string;
  message?: string;
  title?: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'write', label: 'Write it' },
  { id: 'upload', label: 'Upload a file' },
  { id: 'url', label: 'From a URL' },
  { id: 'paste', label: 'Paste notes' },
];

export function AddKnowledgeClient({
  propertyId,
  sections,
  features,
}: {
  propertyId: string;
  sections: AddSection[];
  features: AddFeature[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('write');

  // Write tab: controlled fields so the AI rewrite can land back in the draft.
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [section, setSection] = useState(sections[0]?.value ?? 'space_details');
  const [visibility, setVisibility] = useState('guest');
  const [saveState, saveAction] = useActionState(saveBrainItemAction, {});
  const [improveState, improveAction, improvePending] = useActionState(improveBrainDraftAction, {});

  // Adopt a finished rewrite exactly once per result.
  useEffect(() => {
    if (improveState.ok && improveState.improved) setBody(improveState.improved);
  }, [improveState]);

  const saved = saveState.ok === true;
  useEffect(() => {
    if (!saved) return;
    setTitle('');
    setBody('');
    router.refresh();
  }, [saved, router]);

  const currentSectionLabel =
    sections.find((s) => s.value === section)?.label ??
    features.find((f) => featureSectionId(f.id) === section)?.label ??
    '';

  // Upload / URL / Paste: the existing ingest endpoints, same request shapes the Import
  // panel sends today.
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
      const json = (await res.json()) as IngestResponse;
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setMsg({ kind: 'ok', text: json.message ?? `Imported "${json.title}".` });
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setBusy(false);
    }
  }

  async function ingestJson(endpoint: 'url' | 'text', e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/ingest/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as IngestResponse;
      if (!res.ok) throw new Error(json.error ?? 'Could not import that');
      setMsg({ kind: 'ok', text: json.message ?? 'Imported. It is in your review queue.' });
      form.reset();
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Could not import that' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.9rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setTab(t.id);
              setMsg(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`alert ${msg.kind === 'ok' ? 'alert-success' : 'alert-error'}`}
          style={{ fontSize: '.8rem', marginBottom: '.75rem' }}
        >
          {msg.text}
        </div>
      )}

      {tab === 'write' && (
        <form action={saveAction}>
          <FormMessage error={saveState.error} />
          {saveState.ok && (
            <div className="alert alert-success" style={{ fontSize: '.8rem', marginBottom: '.75rem' }}>
              Saved. It is indexed and your concierge can use it right away.
            </div>
          )}
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="sectionLabel" value={currentSectionLabel} />
          <div className="field">
            <label className="label" htmlFor="add-title">
              Title
            </label>
            <input
              className="input"
              id="add-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Wi-Fi"
              data-testid="input-add-title"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="add-body">
              Details
            </label>
            <textarea
              className="textarea"
              id="add-body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={20000}
              placeholder="e.g. Network name: Cottage_5G — password is on the framed card on the living-room bookshelf"
              data-testid="input-add-body"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div className="brain-form-grid">
            <div className="field">
              <label className="label" htmlFor="add-section">
                Section
              </label>
              <select
                className="select"
                id="add-section"
                name="section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                data-testid="select-add-section"
              >
                {sections.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
                {features.length > 0 && (
                  <optgroup label="Spaces & features">
                    {features.map((f) => (
                      <option key={f.id} value={featureSectionId(f.id)}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="add-visibility">
                Visibility
              </label>
              <select
                className="select"
                id="add-visibility"
                name="visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                data-testid="select-add-visibility"
              >
                <option value="guest">Guests can see</option>
                <option value="internal">Host-only (never shown to guests)</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <SubmitButton>Add to Brain</SubmitButton>
            <button
              type="submit"
              formAction={improveAction}
              className="btn btn-ghost btn-sm"
              disabled={improvePending || body.trim().length < 10}
              data-testid="button-improve-draft"
            >
              {improvePending ? 'Improving…' : 'Improve with AI'}
            </button>
          </div>
          {improveState.error && (
            <p style={{ color: 'var(--coral)', fontSize: '.8rem', marginTop: '.5rem' }}>
              {improveState.error}
            </p>
          )}
          {improveState.ok && (
            <p className="faint" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>
              Draft improved above — review it, then Add to Brain. Never paste a Wi-Fi password or
              door code; write where guests can find it instead.
            </p>
          )}
        </form>
      )}

      {tab === 'upload' && (
        <form onSubmit={uploadDoc}>
          <div className="field">
            <input
              className="input"
              type="file"
              name="file"
              accept=".pdf,.txt,.md,.docx"
              required
              data-testid="input-add-file"
            />
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
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload & index'}
          </button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
            PDF, TXT, MD, or DOCX. Max 25 MB. Imported documents become proposals you review before
            guests see them.
          </p>
        </form>
      )}

      {tab === 'url' && (
        <form onSubmit={(e) => ingestJson('url', e)}>
          <div className="field">
            <input
              className="input"
              type="url"
              name="url"
              placeholder="https://…"
              required
              data-testid="input-add-url"
            />
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
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Fetching…' : 'Fetch details'}
          </button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
            We read the page server-side and organize its details for your review. Some sites block
            automated fetches — use Paste if a URL fails.
          </p>
        </form>
      )}

      {tab === 'paste' && (
        <form onSubmit={(e) => ingestJson('text', e)}>
          <div className="field">
            <textarea
              className="input"
              name="text"
              rows={7}
              required
              minLength={20}
              maxLength={50000}
              placeholder="Paste the listing details, house manual, or any notes here. We'll clean and organize it automatically."
              data-testid="input-add-paste"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
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
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Cleaning…' : 'Clean & index'}
          </button>
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
            Best for blocked sites: open the listing, copy the details, paste here. We structure it
            into a clean summary for your review before indexing.
          </p>
        </form>
      )}
    </div>
  );
}
