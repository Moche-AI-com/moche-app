'use client';

// "Enhance Brain" (§7) — the replacement for the removed "Next questions" list.
//
// "Next questions" was a read-only list of gaps. It told the host what was missing and
// then left them to find the right section themselves, which is where the old taxonomy
// mismatch bit hardest. Enhance Brain asks the question and files the answer.
//
// Placement is derived from the registry: every gap already declares the domain it
// belongs to, and lib/brain/taxonomy maps that domain to a section. So the proposed
// section is deterministic rather than model-generated — and it is rendered as an
// editable select the host confirms before saving, so a wrong guess is one click to fix.
//
// Boundary 4 note: the content saved here is host-authored (they type the answer), not
// AI-authored, so it writes straight to brain_items rather than through proposed_updates.
// Boundary 4 exists to stop AI-generated content entering the Brain unreviewed; a host
// typing their own check-out time is the reviewer.

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { saveBrainItemAction, type BrainActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import type { BrainManagerSection } from './BrainManager';

export interface EnhanceQuestion {
  fieldId: string;
  label: string;
  /** Registry interview prompt when present; the label is a poor question on its own. */
  prompt: string;
  section: string;
  sectionLabel: string;
  hardBlock: boolean;
}

export function EnhanceBrainPanel({
  propertyId,
  questions,
  sections,
}: {
  propertyId: string;
  questions: EnhanceQuestion[];
  sections: BrainManagerSection[];
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<string[]>([]);

  // Blocking gaps first, then whatever the caller ordered by weight. A host who answers
  // three questions should have answered the three that matter most.
  const queue = useMemo(
    () => [...questions].sort((a, b) => Number(b.hardBlock) - Number(a.hardBlock)),
    [questions],
  );
  const remaining = queue.filter((q) => !answered.includes(q.fieldId));
  const current = remaining[Math.min(index, Math.max(remaining.length - 1, 0))] ?? null;

  const advance = (fieldId: string) => {
    setAnswered((prev) => (prev.includes(fieldId) ? prev : [...prev, fieldId]));
    setIndex(0);
  };

  if (questions.length === 0) {
    return (
      <section className="card enhance-panel" data-testid="enhance-brain">
        <div className="enhance-head">
          <Sparkles size={16} aria-hidden style={{ color: 'var(--iris)' }} />
          <h3>Enhance Brain</h3>
        </div>
        <p className="faint enhance-copy">
          Nothing outstanding. Every field your score counts has an answer or is marked N/A.
        </p>
      </section>
    );
  }

  return (
    <section className="card enhance-panel" data-testid="enhance-brain">
      <div className="enhance-head">
        <Sparkles size={16} aria-hidden style={{ color: 'var(--iris)' }} />
        <h3>Enhance Brain</h3>
        <span className="badge">{remaining.length} to answer</span>
      </div>
      <p className="faint enhance-copy">
        Answer in your own words. We file each answer in the right section for you — change the
        section before saving if we guess wrong.
      </p>

      {!open ? (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setOpen(true)}
          data-testid="button-enhance-brain"
        >
          Start answering
        </button>
      ) : remaining.length === 0 || !current ? (
        <p className="enhance-done" data-testid="enhance-brain-done">
          That is all of them. Your score updates on the next page load.
        </p>
      ) : (
        <EnhanceQuestionForm
          key={current.fieldId}
          propertyId={propertyId}
          question={current}
          sections={sections}
          remaining={remaining.length}
          onSaved={() => advance(current.fieldId)}
          onSkip={() => setIndex((i) => (i + 1 >= remaining.length ? 0 : i + 1))}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function EnhanceQuestionForm({
  propertyId,
  question,
  sections,
  remaining,
  onSaved,
  onSkip,
  onClose,
}: {
  propertyId: string;
  question: EnhanceQuestion;
  sections: BrainManagerSection[];
  remaining: number;
  onSaved: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState<BrainActionState, FormData>(saveBrainItemAction, {});

  // Advance only after a confirmed save. Doing this during render would fire on every
  // re-render of a successful form, marking later questions answered.
  const saved = state.ok === true;
  useEffect(() => {
    if (saved) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const uid = question.fieldId;

  return (
    <form action={formAction} className="enhance-form">
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      {/* The registry label is the item title, so the saved row reads the same as the
          field it answers and the next scan can match it. */}
      <input type="hidden" name="title" value={question.label} />
      <input type="hidden" name="visibility" value="guest" />

      <p className="enhance-question" data-testid="enhance-question">
        {question.prompt}
        {question.hardBlock && <span className="badge badge-coral enhance-block-badge">blocks launch</span>}
      </p>

      <div className="field">
        <label className="label" htmlFor={`enhance-body-${uid}`}>Your answer</label>
        <textarea
          className="textarea"
          id={`enhance-body-${uid}`}
          name="body"
          rows={3}
          maxLength={20000}
          required
          data-testid="input-enhance-answer"
        />
      </div>

      <div className="field">
        <label className="label" htmlFor={`enhance-section-${uid}`}>
          Filing under <span className="faint">— change if this is wrong</span>
        </label>
        <select
          className="select"
          id={`enhance-section-${uid}`}
          name="section"
          defaultValue={question.section}
          data-testid="select-enhance-section"
        >
          {sections.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="enhance-actions">
        <SubmitButton>Save answer</SubmitButton>
        {remaining > 1 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}>
            Skip
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Done for now
        </button>
      </div>
    </form>
  );
}
