'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, MessageSquare, Star, X } from 'lucide-react';

type Stage = 'hidden' | 'question' | 'negative' | 'review' | 'thanks';

type EligibilityResponse = {
  eligible?: boolean;
  reviewUrl?: string;
};

const ENGAGED_KEY = 'moche:review-nudge:engaged';

function dismissedKey() {
  return `moche:review-nudge:dismissed:${window.location.pathname}`;
}

export function markReviewNudgeMoment() {
  try {
    window.sessionStorage.setItem(ENGAGED_KEY, '1');
  } catch {
    // Storage can be unavailable in private browsing; the portal still works.
  }
}

export function ReviewNudge({ propertyName }: { propertyName: string }) {
  const [stage, setStage] = useState<Stage>('hidden');
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    try {
      if (window.sessionStorage.getItem(ENGAGED_KEY) !== '1') return;
      if (window.sessionStorage.getItem(dismissedKey()) === '1') return;
      timer = window.setTimeout(async () => {
        try {
          const response = await fetch('/api/guest/review-nudge', { cache: 'no-store' });
          if (!response.ok) return;
          const payload = (await response.json()) as EligibilityResponse;
          if (!cancelled && payload.eligible && payload.reviewUrl) {
            setReviewUrl(payload.reviewUrl);
            setStage('question');
          }
        } catch {
          // A feedback prompt must never interrupt the guest experience.
        }
      }, 1400);
    } catch {
      return;
    }
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function rememberDismissal() {
    try {
      window.sessionStorage.setItem(dismissedKey(), '1');
    } catch {
      // Best effort only.
    }
  }

  async function record(action: 'positive' | 'negative' | 'dismiss' | 'click', details?: { category?: string; comment?: string }) {
    try {
      await fetch('/api/guest/review-nudge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: action === 'click',
        body: JSON.stringify({ action, ...details }),
      });
    } catch {
      // Feedback collection is best effort and never blocks the portal.
    }
  }

  function dismiss() {
    rememberDismissal();
    setStage('hidden');
    void record('dismiss');
  }

  function positive() {
    rememberDismissal();
    setStage('review');
    void record('positive');
  }

  async function submitNegative() {
    if (busy) return;
    setBusy(true);
    rememberDismissal();
    await record('negative', { category: category || undefined, comment: comment.trim() || undefined });
    setBusy(false);
    setStage('thanks');
  }

  if (stage === 'hidden') return null;

  return (
    <aside className="gp-card" style={{ marginTop: '1rem', position: 'relative' }} aria-live="polite" data-testid="review-nudge">
      {stage !== 'thanks' && (
        <button type="button" className="gp-icon-btn" onClick={dismiss} aria-label="Dismiss" style={{ position: 'absolute', right: 10, top: 10 }}>
          <X size={16} aria-hidden />
        </button>
      )}

      {stage === 'question' && (
        <>
          <div className="gp-kicker"><MessageSquare size={14} aria-hidden /> Quick feedback</div>
          <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>Enjoying your stay portal?</h2>
          <p className="gp-muted" style={{ margin: '0 0 .9rem' }}>Is Moche making your stay a little easier?</p>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
            <button type="button" className="gp-btn gp-btn-primary" style={{ width: 'auto' }} onClick={positive}>Yes, it is</button>
            <button type="button" className="gp-btn gp-btn-ghost" style={{ width: 'auto' }} onClick={() => setStage('negative')}>Not really</button>
            <button type="button" className="gp-msg-link" onClick={dismiss}>Not now</button>
          </div>
        </>
      )}

      {stage === 'review' && reviewUrl && (
        <>
          <div className="gp-kicker"><Star size={14} aria-hidden /> Thank you</div>
          <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>Glad to hear it!</h2>
          <p className="gp-muted" style={{ margin: '0 0 .9rem' }}>Would you like to share your experience with {propertyName}?</p>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-primary" style={{ width: 'auto', textDecoration: 'none' }} onClick={() => void record('click')}>
              <Star size={16} aria-hidden /> Leave a property review <ExternalLink size={14} aria-hidden />
            </a>
            <button type="button" className="gp-msg-link" onClick={dismiss}>Maybe later</button>
          </div>
        </>
      )}

      {stage === 'negative' && (
        <>
          <div className="gp-kicker"><MessageSquare size={14} aria-hidden /> Help us improve</div>
          <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>Thanks for telling us.</h2>
          <p className="gp-muted" style={{ margin: '0 0 .8rem' }}>What could be better? This feedback is private and will not open a public review page.</p>
          <div className="gp-field">
            <label className="gp-label" htmlFor="review-feedback-category">Choose one (optional)</label>
            <select id="review-feedback-category" className="gp-input" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Select a reason</option>
              <option value="hard_to_find">Hard to find information</option>
              <option value="unhelpful_answer">An answer was not helpful</option>
              <option value="technical_problem">Something did not work</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="gp-field">
            <label className="gp-label" htmlFor="review-feedback-comment">Anything else? (optional)</label>
            <textarea id="review-feedback-comment" className="gp-textarea" maxLength={800} value={comment} onChange={(event) => setComment(event.target.value)} />
          </div>
          <button type="button" className="gp-btn gp-btn-primary" onClick={() => void submitNegative()} disabled={busy}>
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
        </>
      )}

      {stage === 'thanks' && (
        <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center' }} role="status">
          <Check size={18} aria-hidden style={{ color: 'var(--gp-primary)' }} />
          <span>Thank you. Your feedback helps us improve the portal.</span>
        </div>
      )}
    </aside>
  );
}
