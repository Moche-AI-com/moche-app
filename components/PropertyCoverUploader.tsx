'use client';

import { useRef, useState, useTransition } from 'react';
import { ImageUp, Link2, Trash2, LoaderCircle } from 'lucide-react';

// Host-facing cover image control (backlog P4-05).
//
// Two ways in, one pipeline out: pick a photo from the phone's camera roll, or
// paste a link to one. A pasted link is fetched and stored server-side, never
// hotlinked, so the guest portal keeps working if the original disappears.
// Every control here is at least 44x44px because this is used on a phone far
// more often than on a desktop.

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

type Mode = 'file' | 'url';

export function PropertyCoverUploader({
  propertyId,
  initialUrl,
}: {
  propertyId: string;
  initialUrl: string | null;
}) {
  const [mode, setMode] = useState<Mode>('file');
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [linkValue, setLinkValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const endpoint = `/api/properties/${propertyId}/cover`;

  function reset() {
    setError(null);
    setSuccess(null);
  }

  async function send(init: RequestInit) {
    reset();
    setBusy(true);
    try {
      const res = await fetch(endpoint, init);
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setUrl(json?.url ?? null);
      setSuccess('Cover image saved.');
      setLinkValue('');
      if (fileInput.current) fileInput.current.value = '';
      startTransition(() => {
        // Nudge the server component tree so the portal preview elsewhere on the
        // page reflects the new image without a manual reload.
        window.dispatchEvent(new CustomEvent('moche:cover-updated', { detail: { propertyId } }));
      });
    } catch {
      setError('Network problem. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    if (file.size > MAX_BYTES) {
      setError('That image is larger than 2 MB. Please pick a smaller file or a lower-resolution version.');
      e.target.value = '';
      return;
    }
    const body = new FormData();
    body.append('file', file);
    void send({ method: 'POST', body });
  }

  function onLink(e: React.FormEvent) {
    e.preventDefault();
    const value = linkValue.trim();
    if (!value) {
      setError('Choose a file or paste an image link first.');
      return;
    }
    void send({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: value }),
    });
  }

  async function onRemove() {
    if (!window.confirm('Remove the cover image from this property\u2019s guest portal?')) return;
    await send({ method: 'DELETE' });
    setUrl(null);
    setSuccess('Cover image removed.');
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '.35rem' }}>Cover image</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        The banner photo at the top of your guest portal. JPEG, PNG, or WebP, up to 2 MB.
        We resize it for phones, tablets, and desktops automatically.
      </p>

      {error && <div className="alert-error" style={{ marginBottom: '.75rem' }} role="alert">{error}</div>}
      {success && <div className="alert-success" style={{ marginBottom: '.75rem' }} role="status">{success}</div>}

      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: url ? `center / cover no-repeat url(${url})` : 'var(--surface-2)',
          display: 'grid',
          placeItems: 'center',
          marginBottom: '1rem',
        }}
      >
        {!url && (
          <span className="faint" style={{ fontSize: '.85rem', textAlign: 'center', padding: '1rem' }}>
            No cover image yet
          </span>
        )}
        {busy && (
          <span
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
              background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
            }}
          >
            <LoaderCircle size={22} className="spin" aria-hidden />
            <span className="sr-only">Saving cover image</span>
          </span>
        )}
      </div>

      <div role="tablist" aria-label="How to add a cover image" style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
        <SegmentButton active={mode === 'file'} onClick={() => { setMode('file'); reset(); }} icon={<ImageUp size={16} aria-hidden />}>
          Upload photo
        </SegmentButton>
        <SegmentButton active={mode === 'url'} onClick={() => { setMode('url'); reset(); }} icon={<Link2 size={16} aria-hidden />}>
          Paste link
        </SegmentButton>
      </div>

      {mode === 'file' ? (
        <div>
          <label className="btn btn-primary" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: '.5rem', cursor: busy ? 'progress' : 'pointer' }}>
            <ImageUp size={16} aria-hidden />
            {url ? 'Replace photo' : 'Choose photo'}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={onFile}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />
          </label>
          <p className="faint" style={{ fontSize: '.75rem', marginTop: '.5rem' }}>
            On a phone this opens your camera roll. Location data in the photo is removed when we resize it.
          </p>
        </div>
      ) : (
        <form onSubmit={onLink}>
          <div className="field">
            <label className="label" htmlFor="coverLink">Image link</label>
            <input
              className="input"
              id="coverLink"
              type="url"
              inputMode="url"
              placeholder="https://example.com/photo.jpg"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              maxLength={2000}
              disabled={busy}
              style={{ minHeight: 44 }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy}>
            {busy ? 'Saving…' : 'Save from link'}
          </button>
          <p className="faint" style={{ fontSize: '.75rem', marginTop: '.5rem' }}>
            We download and store a copy, so your portal keeps working even if the original link changes.
          </p>
        </form>
      )}

      {url && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onRemove}
            disabled={busy}
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}
          >
            <Trash2 size={16} aria-hidden />
            Remove cover image
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
      style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: '.4rem', flex: 1, justifyContent: 'center' }}
    >
      {icon}
      {children}
    </button>
  );
}
