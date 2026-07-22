'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { BrainCircuit, MessageSquareReply, Sparkles } from 'lucide-react';
import { answerEscalationAction, type EscalationActionState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

// Human labels for the Brain category buckets. 'auto' is the default: the AI picks the
// best category and a normalized, reusable title so the saved answer is routed correctly.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto — let the AI classify (recommended)' },
  { value: 'core', label: 'Core property info' },
  { value: 'checkin_checkout', label: 'Check-in / checkout' },
  { value: 'house_rules', label: 'House rules' },
  { value: 'appliances', label: 'Appliances & devices' },
  { value: 'transportation', label: 'Parking & transportation' },
  { value: 'local_recommendations', label: 'Local recommendations' },
  { value: 'emergency', label: 'Safety & emergency' },
  { value: 'product_urls', label: 'Products & links' },
  { value: 'host_qa', label: 'General host Q&A' },
];

export function EscalationAnswerForm({
  escalationId,
  defaultValue,
}: {
  escalationId: string;
  defaultValue?: string;
}) {
  const [state, action] = useFormState<EscalationActionState, FormData>(answerEscalationAction, {});
  // Default to teaching the Brain — most answers are reusable. Host can uncheck for one-offs.
  const [saveToBrain, setSaveToBrain] = useState(true);

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
      <input type="hidden" name="escalationId" value={escalationId} />
      <FormMessage error={state.error} />
      {state.ok && (
        <div className="alert alert-success" style={{ marginBottom: '.25rem' }}>
          Reply sent to your guest.
        </div>
      )}

      <label htmlFor="response" style={{ fontWeight: 500, fontSize: '.9rem' }}>
        Your answer
      </label>
      <textarea
        id="response"
        name="response"
        rows={5}
        required
        maxLength={4000}
        defaultValue={defaultValue ?? ''}
        placeholder="Type the answer you'd give this guest. It's delivered straight to their concierge chat."
        className="input"
        style={{ resize: 'vertical' }}
      />

      {/* Save-to-Brain choice: teach the Brain (reusable) vs one-off reply. */}
      <div
        style={{
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: '.7rem',
          padding: '.85rem 1rem',
          background: 'rgba(255,255,255,.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '.65rem',
        }}
      >
        <label style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="convertToBrain"
            checked={saveToBrain}
            onChange={(e) => setSaveToBrain(e.target.checked)}
            style={{ marginTop: '.2rem', width: 16, height: 16, flexShrink: 0, accentColor: '#c9a24b' }}
          />
          <span style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 500, fontSize: '.9rem' }}>
              <BrainCircuit size={16} aria-hidden style={{ color: '#c9a24b' }} /> Save to your Property Brain
            </span>
            <span className="faint" style={{ fontSize: '.78rem', lineHeight: 1.4 }}>
              Teach the Brain so future guests get this answer instantly. Leave unchecked for a
              one-off reply that isn&rsquo;t worth saving.
            </span>
          </span>
        </label>

        {saveToBrain && (
          <div style={{ paddingLeft: '2.2rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <label
              htmlFor="brainCategory"
              className="faint"
              style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: '.35rem' }}
            >
              <Sparkles size={13} aria-hidden /> Category
            </label>
            <select
              id="brainCategory"
              name="brainCategory"
              defaultValue="auto"
              className="input"
              style={{ maxWidth: 360 }}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="faint" style={{ fontSize: '.74rem', lineHeight: 1.4 }}>
              On &ldquo;Auto&rdquo;, the AI routes and labels this answer to the right topic so it&rsquo;s
              found next time. Pick a specific category to override.
            </span>
          </div>
        )}
      </div>

      <div>
        <SubmitButton className="btn btn-primary">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <MessageSquareReply size={16} aria-hidden />
            {saveToBrain ? 'Send reply & teach the Brain' : 'Send reply'}
          </span>
        </SubmitButton>
      </div>
    </form>
  );
}
