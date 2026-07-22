'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { MessageSquare, Star, X, Check } from 'lucide-react';
import { SubmitButton } from '@/components/FormFeedback';
import { submitHostFeedbackAction, type HostFeedbackState } from './feedback-actions';

// Add-on — a small, non-intrusive "Feedback" launcher pinned to the dashboard footer.
// Opens a compact popover with a 1-5 rating + optional note. Never a blocking modal;
// writes a private product_feedback row (source='host') for owner-only analytics.
export function FeedbackControl() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, formAction] = useFormState<HostFeedbackState, FormData>(submitHostFeedbackAction, {});

  return (
    <div style={{ position: 'fixed', right: '1.1rem', bottom: '1.1rem', zIndex: 30 }}>
      {open && (
        <div className="card" style={{ position: 'absolute', bottom: 'calc(100% + .6rem)', right: 0, width: 300, padding: '1.1rem' }} data-testid="host-feedback-popover">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
            <strong style={{ fontSize: '.95rem' }}>Share feedback</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close feedback" data-testid="button-close-feedback">
              <X size={15} aria-hidden />
            </button>
          </div>

          {state.success ? (
            <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }} data-testid="host-feedback-thanks">
              <Check size={15} aria-hidden /> {state.success}
            </div>
          ) : (
            <form action={formAction} data-testid="form-host-feedback">
              <input type="hidden" name="rating" value={rating} />
              <input type="hidden" name="page" value="dashboard" />
              <p className="muted" style={{ fontSize: '.82rem', marginBottom: '.6rem' }}>How&apos;s Moche.AI working for you?</p>
              <div style={{ display: 'flex', gap: '.15rem', marginBottom: '.6rem' }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    aria-label={`Rate ${n} of 5`}
                    data-testid={`button-host-rate-${n}`}
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0, color: 'var(--gold, #c9a96e)' }}
                  >
                    <Star size={22} aria-hidden style={{ fill: n <= (hover || rating) ? 'currentColor' : 'transparent', opacity: n <= (hover || rating) ? 1 : 0.5 }} />
                  </button>
                ))}
              </div>
              <textarea name="comment" className="input" rows={2} maxLength={1000} placeholder="Anything we could do better? (optional)" data-testid="input-host-feedback-comment" />
              {state.error && <div className="alert alert-error" style={{ fontSize: '.82rem', margin: '.5rem 0' }}>{state.error}</div>}
              <div style={{ marginTop: '.5rem' }}>
                <SubmitButton className="btn btn-primary btn-sm btn-block" testId="button-submit-host-feedback">Send feedback</SubmitButton>
              </div>
            </form>
          )}
        </div>
      )}

      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        data-testid="button-open-feedback"
        style={{ boxShadow: '0 6px 20px -8px rgba(0,0,0,.4)', background: 'var(--surface)' }}
      >
        <MessageSquare size={15} aria-hidden style={{ marginRight: '.35rem' }} /> Feedback
      </button>
    </div>
  );
}
