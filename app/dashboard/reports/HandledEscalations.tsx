'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, ChevronRight, Sparkles } from 'lucide-react';
import { SubmitButton } from '@/components/FormFeedback';
import { setMessageTrainingAction, type TrainingFlagState } from './actions';
import { reopenEscalationAction } from '@/app/dashboard/escalations/actions';

export interface HandledThreadMessage {
  id: string;
  role: 'guest' | 'assistant' | 'host';
  content: string;
  created_at: string;
  ai_training_excluded: boolean;
}

export interface HandledEscalation {
  id: string;
  propertyName: string;
  question: string;
  hostResponse: string | null;
  status: string;
  respondedAt: string | null;
  createdAt: string;
  messages: HandledThreadMessage[];
}

const ROLE_LABEL: Record<HandledThreadMessage['role'], string> = {
  guest: 'Guest',
  assistant: 'Concierge (AI)',
  host: 'Your team',
};

function fmtWhen(value: string | null) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * One host reply's AI-training switch.
 *
 * Rendered as a real form rather than an auto-saving toggle because the action has
 * a consequence the host should feel they made deliberately — it changes what the
 * concierge is allowed to repeat to future guests. `useFormState` surfaces a
 * failure inline; success needs no message because the button's own label flips.
 */
function TrainingToggle({ message, escalationId }: { message: HandledThreadMessage; escalationId: string }) {
  const [state, submit] = useFormState<TrainingFlagState, FormData>(setMessageTrainingAction, {});
  const excluded = message.ai_training_excluded;

  return (
    <form action={submit} className="handled-train">
      <input type="hidden" name="messageId" value={message.id} />
      <input type="hidden" name="escalationId" value={escalationId} />
      {/* Submitting the OPPOSITE of the current state — the button is a flip, not a save. */}
      <input type="hidden" name="excluded" value={excluded ? 'false' : 'true'} />
      <span className={`badge ${excluded ? 'badge-coral' : 'badge-teal'}`} data-testid={`training-state-${message.id}`}>
        {excluded ? 'Excluded from AI training' : 'Used for AI training'}
      </span>
      <SubmitButton className="btn btn-ghost btn-sm" testId={`training-toggle-${message.id}`}>
        {excluded ? 'Use for training' : 'Exclude'}
      </SubmitButton>
      {state.error ? (
        <span className="badge badge-coral" role="alert">{state.error}</span>
      ) : null}
    </form>
  );
}

// Puts a closed escalation back into the active inbox, as it was. The status is
// untouched — a reopened handled item comes back as Handled, not as a question.
function ReopenButton({ escalationId }: { escalationId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={working}
      data-testid={`reopen-escalation-${escalationId}`}
      onClick={async () => {
        setWorking(true);
        const formData = new FormData();
        formData.set('escalationId', escalationId);
        await reopenEscalationAction({}, formData);
        router.refresh();
      }}
    >
      {working ? 'Reopening…' : 'Reopen'}
    </button>
  );
}

/**
 * The record of every guest question a real person ended up handling: what was
 * asked, what the team replied, and the full surrounding conversation.
 *
 * This lives in Reports rather than Escalations because Escalations is a queue —
 * it is about what still needs doing. Once something is handled it becomes
 * reference material: the thing a host goes looking for when a guest says "your
 * colleague told me X last month", or when they want to check what the concierge
 * had already tried before the question came through.
 *
 * Threads are collapsed by default. An open one is the exception, not the default
 * state, so a long list stays scannable.
 */
export function HandledEscalations({ items }: { items: HandledEscalation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="muted" style={{ fontSize: '.88rem' }}>No closed escalations yet. When your team closes a handled or cancelled escalation, the whole thread is kept here.</p>;
  }

  return (
    <div className="report-list" data-testid="handled-escalations-list">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id} data-testid="report-escalation-row" className="handled-row">
            <button
              type="button"
              className="report-list-row handled-head"
              onClick={() => setOpenId(open ? null : item.id)}
              aria-expanded={open}
              data-testid={`handled-toggle-${item.id}`}
            >
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <p className="report-list-title">{item.question}</p>
                <p className="report-list-meta">
                  {item.propertyName} &middot; {item.status === 'dismissed' ? 'Cancelled' : item.status === 'resolved' ? 'Handled' : 'Awaiting guest response'} {fmtWhen(item.respondedAt ?? item.createdAt)}
                  {item.messages.length > 0 && <> &middot; {item.messages.length} messages</>}
                </p>
              </div>
              <ChevronRight
                size={16}
                aria-hidden
                className="handled-chev"
                style={{ transform: open ? 'rotate(90deg)' : 'none' }}
              />
            </button>

            {open && (
              <div className="handled-thread" data-testid={`handled-thread-${item.id}`}>
                {item.messages.length === 0 ? (
                  <p className="muted" style={{ fontSize: '.85rem', margin: 0 }}>
                    {item.hostResponse
                      ? `Your reply: ${item.hostResponse}`
                      : 'No conversation was recorded for this escalation.'}
                  </p>
                ) : (
                  item.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`handled-msg handled-msg-${m.role}`}
                      data-testid={`handled-msg-${m.role}`}
                    >
                      <p className="handled-who">
                        {m.role === 'assistant' && <Sparkles size={11} aria-hidden />}
                        {ROLE_LABEL[m.role]}
                        <span className="faint"> &middot; {fmtWhen(m.created_at)}</span>
                      </p>
                      <p className="handled-text">{m.content}</p>
                      {/* Only the team's own words are theirs to withhold from the
                          concierge — a guest question or an AI answer is not. */}
                      {m.role === 'host' && <TrainingToggle message={m} escalationId={item.id} />}
                    </div>
                  ))
                )}
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.35rem', alignSelf: 'flex-start' }}>
                  <Link
                    href={`/dashboard/escalations/${item.id}`}
                    className="btn btn-ghost btn-sm"
                  >
                    <MessageSquare size={13} aria-hidden /> Open escalation
                  </Link>
                  <ReopenButton escalationId={item.id} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <style jsx>{`
        .handled-row {
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
        }
        .handled-head {
          display: flex; align-items: center; gap: .6rem; width: 100%;
          min-height: 52px; cursor: pointer;
          border: 0; background: transparent; color: inherit; font: inherit;
          transition: background .16s ease;
        }
        .handled-head:hover { background: var(--bg-2); }
        .handled-chev { flex-shrink: 0; opacity: .55; transition: transform .18s ease; }
        .handled-thread {
          display: flex; flex-direction: column; gap: .6rem;
          padding: .3rem 1rem 1rem;
          border-top: 1px solid var(--border);
        }
        .handled-msg {
          padding: .6rem .75rem; border-radius: 10px;
          background: var(--bg-2); border-left: 2px solid var(--border);
        }
        /* Author is carried by the border colour as well as the label, so a long
           thread can be skimmed for "where did a person step in?" at a glance. */
        .handled-msg-host { border-left-color: var(--teal); }
        .handled-msg-assistant { border-left-color: var(--border); }
        .handled-who {
          display: flex; align-items: center; gap: .3rem;
          margin: 0 0 .25rem; font-size: .72rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: .06em; opacity: .7;
        }
        .handled-text { margin: 0; font-size: .88rem; line-height: 1.55; white-space: pre-wrap; }
        .handled-train {
          display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
          margin-top: .55rem; padding-top: .55rem;
          border-top: 1px dashed var(--border);
        }
        @media (prefers-reduced-motion: reduce) {
          .handled-head, .handled-chev { transition: none; }
        }
      `}</style>
    </div>
  );
}
