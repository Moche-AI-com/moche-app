'use client';

import { useFormState } from 'react-dom';
import { answerViaLinkAction, type AnswerLinkState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

export function AnswerLinkForm({ token, question }: { token: string; question: string }) {
  const [state, action] = useFormState<AnswerLinkState, FormData>(answerViaLinkAction, {});

  if (state.ok) {
    return (
      <div className="alert alert-success" data-testid="answer-link-success">
        Answer sent to your guest and saved to your Property Brain. You can close this page.
      </div>
    );
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }} data-testid="answer-link-form">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state.error} />
      <div className="card" style={{ padding: '1rem 1.15rem' }}>
        <span className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Guest question
        </span>
        <p style={{ margin: '.35rem 0 0', fontWeight: 500 }} data-testid="answer-link-question">{question}</p>
      </div>
      <label htmlFor="response" style={{ fontWeight: 500, fontSize: '.9rem' }}>Your answer</label>
      <textarea
        id="response"
        name="response"
        rows={5}
        required
        maxLength={4000}
        placeholder="Type the answer you'd give this guest. It's saved to your Brain and sent to them automatically."
        className="input"
        style={{ resize: 'vertical' }}
        data-testid="answer-link-textarea"
      />
      <p className="faint" style={{ fontSize: '.78rem', margin: 0 }}>
        This secure link expires 15 minutes after the question was raised. Answering teaches your
        Property Brain and delivers the reply to the guest automatically.
      </p>
      <div>
        <SubmitButton className="btn btn-primary">Send answer</SubmitButton>
      </div>
    </form>
  );
}
