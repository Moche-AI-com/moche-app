'use client';

// The input affordances the wizard renders (directive §2: "use steppers, dropdowns,
// chips/segmented controls where possible; avoid free text where structured input
// is possible").
//
// Each control is uncontrolled and posts under the question's field_id, so the step
// form is a plain HTML form and a submit works with JavaScript still loading. The
// only state any of these hold is presentational.

import { useId, useState } from 'react';
import { Minus, Plus, Eye, EyeOff, HelpCircle } from 'lucide-react';
import type { WizardQuestion, WizardSubQuestion } from '@/lib/onboarding/wizard';

/**
 * A "why we ask" disclosure rather than a `title` tooltip.
 *
 * `title` is invisible on touch devices and unreliable for screen readers, and this
 * copy is the difference between a host understanding why we want an emergency
 * contact and skipping the question. A native details/summary is keyboard
 * accessible with no script.
 */
export function Hint({ text }: { text: string }) {
  return (
    <details className="wizard-hint">
      <summary aria-label="Why we ask">
        <HelpCircle size={13} aria-hidden="true" />
        <span>Why we ask</span>
      </summary>
      <p>{text}</p>
    </details>
  );
}

export function Stepper({
  name,
  defaultValue,
  min = 0,
  max = 20,
  unit,
  id,
}: {
  name: string;
  defaultValue?: string;
  min?: number;
  max?: number;
  unit?: string;
  id?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  const inputId = id ?? name;
  const n = value === '' ? null : Number(value);

  const nudge = (delta: number) => {
    const base = n === null ? (delta > 0 ? min : min) : n;
    const next = Math.min(max, Math.max(min, base + (n === null ? 0 : delta)));
    setValue(String(next));
  };

  return (
    <div className="wizard-stepper">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => nudge(-1)}
        disabled={n !== null && n <= min}
        aria-label="Decrease"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        className="input"
        id={inputId}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="—"
      />
      {unit ? <span className="faint wizard-unit">{unit}</span> : null}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => nudge(1)}
        disabled={n !== null && n >= max}
        aria-label="Increase"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Chips. Rendered as a radio group so one tap answers the question and the keyboard
 * behaviour (arrow keys within the group) is the browser's, not ours.
 */
export function Segmented({
  name,
  options,
  defaultValue,
  labelledBy,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  labelledBy?: string;
}) {
  return (
    <div className="wizard-chips" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((o) => (
        <label key={o.value} className="wizard-chip">
          <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * A secret field.
 *
 * `autoComplete="off"` and `spellCheck={false}` keep a Wi-Fi password out of the
 * browser's own suggestion store, and the reveal toggle exists because a host who
 * cannot check what they typed is the reason we get transcription errors in door
 * codes. The value posts once and is vaulted server-side; it is never echoed back
 * into this input on a later render.
 */
export function SecretInput({
  name,
  placeholder,
  id,
}: {
  name: string;
  placeholder?: string;
  id?: string;
}) {
  const [shown, setShown] = useState(false);
  const inputId = id ?? name;
  return (
    <div className="wizard-secret">
      <input
        className="input"
        id={inputId}
        name={name}
        type={shown ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide' : 'Show'}
      >
        {shown ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
      </button>
    </div>
  );
}

/** A start/end pair that composes into one stored string ("22:00 to 08:00"). */
export function TimeRange({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const [start, end] = splitRange(defaultValue);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const composed = from && to ? `${from} to ${to}` : from || to || '';
  return (
    <div className="wizard-range">
      <input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
      <span className="faint">to</span>
      <input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      <input type="hidden" name={name} value={composed} />
    </div>
  );
}

function splitRange(v?: string): [string, string] {
  if (!v) return ['', ''];
  const m = v.split(/\s+to\s+/i);
  return [m[0] ?? '', m[1] ?? ''];
}

function controlFor(
  q: Pick<WizardQuestion, 'control' | 'options' | 'placeholder' | 'defaultValue' | 'unit' | 'min' | 'max'>,
  name: string,
  inputId: string,
  labelledBy?: string,
) {
  switch (q.control) {
    case 'stepper':
      return <Stepper name={name} id={inputId} defaultValue={q.defaultValue} min={q.min} max={q.max} unit={q.unit} />;
    case 'segmented':
      return (
        <Segmented
          name={name}
          options={q.options ?? []}
          defaultValue={q.defaultValue}
          labelledBy={labelledBy}
        />
      );
    case 'select':
      return (
        <select className="select" id={inputId} name={name} defaultValue={q.defaultValue ?? ''}>
          <option value="">Choose one…</option>
          {(q.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'time':
      return <input className="input" id={inputId} name={name} type="time" defaultValue={q.defaultValue} />;
    case 'time_range':
      return <TimeRange name={name} defaultValue={q.defaultValue} />;
    case 'secret':
      return <SecretInput name={name} id={inputId} placeholder={q.placeholder} />;
    case 'textarea':
      return (
        <textarea
          className="input"
          id={inputId}
          name={name}
          rows={3}
          maxLength={2000}
          placeholder={q.placeholder}
          defaultValue={q.defaultValue}
        />
      );
    case 'contact':
      return (
        <input
          className="input"
          id={inputId}
          name={name}
          type="text"
          inputMode="tel"
          maxLength={200}
          placeholder={q.placeholder}
          defaultValue={q.defaultValue}
        />
      );
    case 'place':
    case 'text':
    default:
      return (
        <input
          className="input"
          id={inputId}
          name={name}
          type="text"
          maxLength={q.control === 'text' ? 200 : 200}
          placeholder={q.placeholder}
          defaultValue={q.defaultValue}
        />
      );
  }
}

function SubQuestionField({ parentId, sub }: { parentId: string; sub: WizardSubQuestion }) {
  const id = useId();
  const name = `${parentId}__${sub.key}`;
  return (
    <div className="field wizard-sub">
      <label className="label" htmlFor={id} id={`${id}-label`}>
        {sub.label}
      </label>
      {controlFor(
        { control: sub.control, options: sub.options, placeholder: sub.placeholder, unit: sub.unit, min: sub.min, max: sub.max },
        name,
        id,
        `${id}-label`,
      )}
    </div>
  );
}

/**
 * One question, with its follow-ups.
 *
 * The prompt is the label — it comes from the registry's `interview_prompt`, so the
 * question a host reads here is word-for-word the question the Brain page shows for
 * the same field. Two phrasings of one question is how a host ends up answering it
 * twice.
 */
export function QuestionField({ q, error }: { q: WizardQuestion; error?: string }) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  return (
    <div className="field wizard-question">
      <label className="label" htmlFor={id} id={labelId}>
        {q.prompt}
        {q.hardBlock ? (
          <span className="badge wizard-required" title="Guests ask this constantly">
            Important
          </span>
        ) : null}
      </label>
      {controlFor(q, q.fieldId, id, labelId)}
      {q.compose && q.compose.length > 0 ? (
        <div className="wizard-subgroup">
          {q.compose.map((s) => (
            <SubQuestionField key={s.key} parentId={q.fieldId} sub={s} />
          ))}
        </div>
      ) : null}
      {q.help ? <Hint text={q.help} /> : null}
      {error ? (
        <p className="wizard-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
