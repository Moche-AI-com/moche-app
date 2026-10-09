'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ExternalLink, MessageSquare, X } from 'lucide-react';
import { canShowAutomaticPrompt, REVIEW_NUDGE_CHECK_LIMIT, REVIEW_NUDGE_IDLE_MS, safeReviewUrl } from '@/lib/guest/review-nudge-policy';

type Eligibility = { eligible?: boolean; automatic?: boolean; shouldPrompt?: boolean; reviewUrl?: string | null; stayKey?: string };
async function post(body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('/api/guest/review-nudge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, keepalive: body.action === 'click' || body.action === 'dismiss' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not save. Please try again.');
    return data as { ok?: boolean; allowed?: boolean };
  } finally { window.clearTimeout(timer); }
}
export function ReviewNudge({ propertyName, onContactHost }: { propertyName: string; onContactHost: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [helpfulness, setHelpfulness] = useState('');
  const [comment, setComment] = useState('');
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stopped = useRef(false);
  const mounted = useRef(false);
  const storageKey = useRef<string | null>(null);
  const automatic = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let attempts = 0;
    let started = Date.now();
    let inFlight = false;
    const quiet = () => {
      const editing = !!document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
      return canShowAutomaticPrompt({ visible: document.visibilityState === 'visible', focused: document.hasFocus(), editing, elapsedMs: Date.now() - started, claimed: stopped.current });
    };
    const resetIdle = () => { started = Date.now(); };
    const read = async (tryPrompt: boolean) => {
      if (inFlight || (tryPrompt && (attempts >= REVIEW_NUDGE_CHECK_LIMIT || !quiet()))) return;
      inFlight = true;
      if (tryPrompt) attempts++;
      try {
        const response = await fetch('/api/guest/review-nudge', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as Eligibility;
        if (controller.signal.aborted || !data.eligible || !data.stayKey) return;
        setEnabled(true);
        setReviewUrl(safeReviewUrl(data.reviewUrl));
        storageKey.current = `moche:review-nudge:v2:${data.stayKey}`;
        try { if (window.sessionStorage.getItem(storageKey.current) === '1') stopped.current = true; } catch { /* The server remains authoritative. */ }
        if (!tryPrompt || !data.automatic || !data.shouldPrompt || !quiet()) return;
        stopped.current = true;
        const claim = await post({ action: 'impression', automatic: true });
        if (claim.allowed && mounted.current) {
          automatic.current = true;
          try { window.sessionStorage.setItem(storageKey.current, '1'); } catch { /* Best effort. */ }
          if (document.visibilityState === 'visible' && document.hasFocus() && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) setOpen(true);
        }
      } catch { /* Eligibility failures never interrupt a guest task or trigger retries without a bound. */ }
      finally { inFlight = false; }
    };
    void read(false);
    const timer = window.setInterval(() => void read(true), REVIEW_NUDGE_IDLE_MS);
    document.addEventListener('pointerdown', resetIdle, { passive: true });
    document.addEventListener('keydown', resetIdle);
    document.addEventListener('visibilitychange', resetIdle);
    return () => {
      mounted.current = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('pointerdown', resetIdle);
      document.removeEventListener('keydown', resetIdle);
      document.removeEventListener('visibilitychange', resetIdle);
    };
  }, []);

  function stop() {
    stopped.current = true;
    try { if (storageKey.current) window.sessionStorage.setItem(storageKey.current, '1'); } catch { /* Best effort. */ }
  }
  function dismiss() { stop(); setOpen(false); void post({ action: 'dismiss' }).catch(() => undefined); }
  function launch() {
    stop(); automatic.current = false; setSaved(false); setError(''); setOpen(true);
    void post({ action: 'impression', automatic: false }).catch(() => undefined);
    window.setTimeout(() => title.current?.focus(), 0);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || rating === null) return;
    setBusy(true); setError('');
    try {
      const result = await post({ action: 'response', rating, ...(helpfulness ? { helpfulness } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) });
      if (!result.ok) throw new Error('Could not save. Please try again.');
      stop();
      if (mounted.current) { setSaved(true); setComment(''); }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Could not save. Your feedback is still here; please try again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (!enabled) return null;
  const review = reviewUrl ? <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="gp-msg-link" onClick={() => { stop(); void post({ action: 'click' }).catch(() => undefined); }}>Leave an honest property review <ExternalLink size={14} aria-hidden /></a> : null;
  return <aside className="gp-card" style={{ marginTop: '1rem' }} data-testid="review-nudge">
    {!open ? <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}><button type="button" className="gp-msg-link" onClick={launch} data-testid="review-nudge-launcher"><MessageSquare size={14} aria-hidden /> Share feedback</button>{review}</div> : <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><h2 className="gp-wf-title" ref={title} tabIndex={-1}>{saved ? 'Thank you' : 'How is your stay?'}</h2><button type="button" className="gp-icon-btn" onClick={dismiss} aria-label="Close feedback"><X size={16} aria-hidden /></button></div>
      {automatic.current && !saved && <p className="gp-muted" role="status">Optional feedback — we will not automatically ask again during this stay.</p>}
      {saved ? <p role="status"><Check size={18} aria-hidden /> Your private feedback was saved.</p> : <form onSubmit={submit} aria-busy={busy}>
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 1rem' }} disabled={busy}><legend className="gp-label">Rate your stay at {propertyName}</legend><div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>{[1, 2, 3, 4, 5].map((value) => <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '.25rem', minHeight: 44, padding: '.35rem' }}><input type="radio" name="stay-rating" value={value} required checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} /><span aria-hidden>{value} ★</span></label>)}</div></fieldset>
        <div className="gp-field"><label className="gp-label" htmlFor="review-helpfulness">Has this portal been helpful? (optional)</label><select id="review-helpfulness" className="gp-input" value={helpfulness} onChange={(e) => setHelpfulness(e.target.value)} disabled={busy}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="somewhat">Somewhat</option><option value="not_yet">Not yet</option></select></div>
        <div className="gp-field"><label className="gp-label" htmlFor="review-comment">Anything you would like to share? (optional)</label><textarea id="review-comment" className="gp-textarea" maxLength={800} value={comment} onChange={(e) => setComment(e.target.value)} disabled={busy} /></div>
        <p className="gp-muted">Private feedback goes to Moche. It is not published to a booking platform. For help with your stay, contact your host.</p>
        {error && <p role="alert">{error}</p>}
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}><button type="submit" className="gp-btn gp-btn-primary" style={{ width: 'auto' }} disabled={busy || rating === null}>{busy ? 'Saving…' : error ? 'Try saving again' : 'Send private feedback'}</button><button type="button" className="gp-msg-link" onClick={dismiss}>Not now</button></div>
      </form>}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>{review}<button type="button" className="gp-msg-link" onClick={() => { dismiss(); onContactHost(); }}>Contact your host</button></div>
    </>}
  </aside>;
}
