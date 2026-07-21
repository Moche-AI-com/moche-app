'use client';

import { useFormState } from 'react-dom';
import { answerEscalationAction, type EscalationActionState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export function EscalationAnswerForm({
  escalationId,
  defaultValue,
}: {
  escalationId: string;
  defaultValue?: string;
}) {
  const [state, action] = useFormState<EscalationActionState, FormData>(answerEscalationAction, {});

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
      <input type="hidden" name="escalationId" value={escalationId} />
      <FormMessage error={state.error} />
      {state.ok && (
        <div className="alert alert-success" style={{ marginBottom: '.25rem' }}>
          Saved to your Property Brain — future guests get this instantly.
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
        placeholder="Type the answer you'd give this guest. It's saved to your Brain and sent to them automatically."
        className="input"
        style={{ resize: 'vertical' }}
      />
      <p className="faint" style={{ fontSize: '.78rem', margin: 0 }}>
        Answering teaches your Property Brain automatically and delivers the reply to the guest&rsquo;s chat.
      </p>
      <div>
        <SubmitButton className="btn btn-primary">Save answer &amp; teach the Brain</SubmitButton>
      </div>
    </form>
  );
}
