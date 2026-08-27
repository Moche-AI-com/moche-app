'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Circle, X } from 'lucide-react';

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

// `name`/`value` let a single form carry more than one submit path (the browser
// only submits the button that was actually clicked), which is how the tone banner
// distinguishes "keep" from "discard" without two separate forms.
//
// `disabled` lets a form gate submission on client-side validity (signup, password
// reset): the button renders grayed out and cannot be clicked until every required
// field is valid. Pair it with `disabledHint`, which renders in an aria-live status
// line under the button so WHAT is still missing is announced, not just implied.
export function SubmitButton({
  children,
  className = 'btn btn-primary btn-block',
  testId,
  name,
  value,
  disabled = false,
  disabledHint,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const { pending } = useFormStatus();
  const gated = !pending && disabled;
  return (
    <>
      <button
        type="submit"
        className={className}
        disabled={pending || disabled}
        aria-busy={pending}
        data-testid={testId}
        name={name}
        value={value}
        style={gated ? { opacity: 0.45, filter: 'grayscale(0.7)', boxShadow: 'none', cursor: 'not-allowed' } : undefined}
      >
        {pending ? 'Working…' : children}
      </button>
      {gated && disabledHint ? (
        <p role="status" className="muted" style={{ fontSize: '.78rem', marginTop: '.55rem', marginBottom: 0, textAlign: 'center' }}>
          {disabledHint}
        </p>
      ) : null}
    </>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>;
  if (success) return <div className="alert alert-success" role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>{success}</div>;
  return null;
}

// Inline, field-level error rendered directly under the offending input (unlike
// FormMessage, which summarizes at the top of the form). Wire it up with the
// input's aria-describedby so screen readers announce it in context.
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" style={{ color: 'var(--coral, #ff6b54)', fontSize: '.78rem', marginTop: '.35rem', marginBottom: 0 }}>
      {message}
    </p>
  );
}

// Pragmatic client-side email format check for inline validation. The server
// stays the authority: `emailSchema` in lib/validation.ts re-validates on submit.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return value.length > 0 && value.length <= 320 && EMAIL_PATTERN.test(value);
}

// Hard password rules, mirrored 1:1 from `passwordSchema` in lib/validation.ts —
// the server-side source of truth for both signup and password reset. If a rule
// is ever added there, add it here in the same order: the checklist must never
// promise something the server would reject, nor hide something it requires.
const PASSWORD_RULES: ReadonlyArray<{ key: string; label: string; test: (password: string) => boolean }> = [
  { key: 'length', label: 'At least 10 characters', test: (password) => password.length >= 10 },
];

export function passwordMeetsRequirements(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

// Live checklist rendered under a password field. Each rule checks off as the
// person types, so a too-short password is never a submit-time surprise.
export function PasswordRequirements({ id, password }: { id: string; password: string }) {
  return (
    <ul id={id} aria-label="Password requirements" style={{ listStyle: 'none', margin: '.5rem 0 0', padding: 0, display: 'grid', gap: '.3rem' }}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '.45rem',
              fontSize: '.78rem',
              color: met ? 'var(--teal)' : 'var(--text-muted)',
              transition: 'color .15s ease',
            }}
          >
            {met ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
            <span>{rule.label}</span>
            <span style={visuallyHidden}>{met ? '(met)' : '(not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Token input: a freeform text field that converts an entry into a removable
// chip only once `validate` accepts it (Enter, comma, or the Add button). Used
// for the Email report "To"/"CC" fields, where an address must be real before
// it is added — never a bare string riding along in a JSON body.
export function ChipInput({
  id,
  label,
  hint,
  values,
  onChange,
  validate,
  placeholder,
  inputType = 'text',
  addLabel = 'Add',
  testId,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  validate: (raw: string) => string | null;
  placeholder?: string;
  inputType?: string;
  addLabel?: string;
  testId?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const candidate = draft.trim();
    if (!candidate) return;
    const problem = validate(candidate);
    if (problem) {
      setError(problem);
      return;
    }
    if (!values.includes(candidate)) onChange([...values, candidate]);
    setDraft('');
    setError(null);
  }

  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: '.4rem' }}>
        <input
          className="input"
          id={id}
          type={inputType}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            }
          }}
          style={{ minHeight: 44 }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={commit}
          disabled={disabled || !draft.trim()}
          data-testid={testId ? `${testId}-add` : undefined}
          style={{ minHeight: 44 }}
        >
          {addLabel}
        </button>
      </div>
      {hint && !error ? <p className="faint" style={{ fontSize: '.74rem', margin: '.3rem 0 0' }}>{hint}</p> : null}
      {error ? <FieldError id={`${id}-error`} message={error} /> : null}
      {values.length > 0 ? (
        <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '.35rem', margin: '.5rem 0 0', padding: 0 }}>
          {values.map((v) => (
            <li
              key={v}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '.35rem',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '999px', padding: '.2rem .35rem .2rem .65rem', fontSize: '.78rem',
              }}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                disabled={disabled}
                style={{
                  display: 'inline-grid', placeItems: 'center', width: 18, height: 18,
                  borderRadius: '999px', border: 'none', background: 'transparent',
                  color: 'var(--text-faint)', cursor: 'pointer', padding: 0,
                }}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
