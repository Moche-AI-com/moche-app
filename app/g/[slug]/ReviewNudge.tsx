'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, MessageSquare, Star, X } from 'lucide-react';

type Stage = 'hidden' | 'launcher' | 'question' | 'outcome' | 'feedback' | 'thanks';
type Mood = 'great' | 'okay' | 'needs_attention';

type EligibilityResponse = {
  eligible?: boolean;
  automatic?: boolean;
  shouldPrompt?: boolean;
  reviewUrl?: string;
};

function dismissedKey() {
  return `moche:review-nudge:dismissed:${window.location.pathname}`;
}

function postEvent(action: 'impression' | 'response' | 'dismiss' | 'click', details?: { mood?: Mood; category?: string; comment?: string }) {
  return fetch('/api/guest/review-nudge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    keepalive: action === 'click',
    body: JSON.stringify({ action, ...details }),
  }).then(() => undefined).catch(() => undefined);
}

function ReviewLink({ reviewUrl, mood, onClick }: { reviewUrl: string | null; mood: Mood | null; onClick: (mood?: Mood) => void }) {
  if (!reviewUrl) return null;
  return (
    <a
      href={reviewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="gp-btn gp-btn-primary"
      style={{ width: 'auto', textDecoration: 'none' }}
      onClick={() => onClick(mood ?? undefined)}
    >
      <Star size={16} aria-hidden /> Leave a property review <ExternalLink size={14} aria-hidden />
    </a>
  );
}

export function ReviewNudge({ propertyName, onContactHost }: { propertyName: string; onContactHost: () => void }) {
  const [stage, setStage] = useState<Stage>('hidden');
  const [mood, setMood] = useState<Mood | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const impressionSent = useRef(false);

  function showQuestion() {
    setStage('question');
    if (!impressionSent.current) {
      impressionSent.current = true;
      void postEvent('impression');
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    try {
      if (window.sessionStorage.getItem(dismissedKey()) === '1') return;
      timer = window.setTimeout(async () => {
        try {
          const response = await fetch('/api/guest/review-nudge', { cache: 'no-store' });
          if (!response.ok) return;
          const payload = (await response.json()) as EligibilityResponse;
          if (cancelled || !payload.eligible || !payload.reviewUrl) return;
          setReviewUrl(payload.reviewUrl);
          if (payload.automatic && payload.shouldPrompt) {
            setStage('question');
            impressionSent.current = true;
            void postEvent('impression');
          } else if (!payload.automatic) {
            setStage('launcher');
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

  function dismiss() {
    rememberDismissal();
    setStage('hidden');
    if (!mood) void postEvent('dismiss');
  }

  function chooseMood(value: Mood) {
    setMood(value);
    rememberDismissal();
    setStage('outcome');
    void postEvent('response', { mood: value });
  }

  async function submitFeedback() {
    if (!mood || busy) return;
    setBusy(true);
    await postEvent('response', { mood, category: category || undefined, comment: comment.trim() || undefined });
    setBusy(false);
    setStage('thanks');
  }

  function openHostChat() {
    setStage('hidden');
    onContactHost();
  }

  const recordClick = (value?: Mood) => {
    void postEvent('click', { mood: value });
  };

  if (stage === 'hidden') return null;
  if (stage === 'launcher') {
    return (
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button type="button" className="gp-msg-link" onClick={showQuestion} data-testid="review-nudge-launcher">
          <MessageSquare size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 5 }} /> Share feedback
        </button>
      </div>
    );
  }

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
          <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>Did this portal help with your stay?</h2>
          <p className="gp-muted" style={{ margin: '0 0 .9rem' }}>A quick answer helps improve the guest experience.</p>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
            <button type="button" className="gp-btn gp-btn-primary" style={{ width: 'auto' }} onClick={() => chooseMood('great')}>Yes</button>
            <button type="button" className="gp-btn gp-btn-ghost" style={{ width: 'auto' }} onClick={() => chooseMood('okay')}>Somewhat</button>
            <button type="button" className="gp-btn gp-btn-ghost" style={{ width: 'auto' }} onClick={() => chooseMood('needs_attention')}>Not yet</button>
            <button type="button" className="gp-msg-link" onClick={dismiss}>Not now</button>
          </div>
        </>
      )}

      {stage === 'outcome' && mood && (
        <>
          <div className="gp-kicker">
            {mood === 'great' ? <Star size={14} aria-hidden /> : <MessageSquare size={14} aria-hidden />}
            {mood === 'great' ? 'Thank you' : 'We are listening'}
          </div>
          <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>
            {mood === 'great' ? 'Glad it helped.' : mood === 'okay' ? 'Thanks for letting us know.' : 'Let’s help make it right.'}
          </h2>
          <p className="gp-muted" style={{ margin: '0 0 .9rem' }}>
            Share an honest review of {propertyName}, send private portal feedback, or contact your host if you need help.
          </p>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <ReviewLink reviewUrl={reviewUrl} mood={mood} onClick={recordClick} />
            {mood === 'needs_attention' && (
              <button type="button" className="gp-btn gp-btn-primary" style={{ width: 'auto' }} onClick={openHostChat}>Contact your host</button>
            )}
            <button type="button" className="gp-btn gp-btn-ghost" style={{ width: 'auto' }} onClick={() => setStage('feedback')}>Send private feedback</button>
            <button type="button" className="gp-msg-link" onClick={dismiss}>Done</button>
          </div>
        </>
      )}

      {stage === 'feedback' && mood && (
        <>
          <div className="gp-kicker"><MessageSquare size={14} aria-hidden /> Private feedback</div>
          <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>What could be better?</h2>
          <p className="gp-muted" style={{ margin: '0 0 .8rem' }}>This goes privately to Moche and does not affect your ability to leave a property review.</p>
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
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
            <button type="button" className="gp-btn gp-btn-primary" style={{ width: 'auto' }} onClick={() => void submitFeedback()} disabled={busy}>
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
            <ReviewLink reviewUrl={reviewUrl} mood={mood} onClick={recordClick} />
          </div>
        </>
      )}

      {stage === 'thanks' && (
        <>
          <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', marginBottom: '.8rem' }} role="status">
            <Check size={18} aria-hidden style={{ color: 'var(--gp-primary)' }} />
            <span>Thank you. Your feedback helps us improve the portal.</span>
          </div>
          <ReviewLink reviewUrl={reviewUrl} mood={mood} onClick={recordClick} />
        </>
      )}
    </aside>
  );
}
