'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { deletePropertyAction, type PropertyFormState } from '../actions';
import { SubmitButton } from '@/components/FormFeedback';
import { DELETE_CONFIRMATION_WORD } from '@/lib/properties/delete-confirmation';

/**
 * Permanent-delete affordance for a property, rendered at the bottom of the
 * property's Configuration page.
 *
 * Deliberately NOT sitting next to Archive in the header controls, and no
 * longer on the overview page either: Archive is reversible and lives with
 * the other status buttons, while this is the one action in the property
 * that cannot be undone. It sits inside Configuration — a surface only
 * property editors can open — at the very bottom, behind its own
 * confirmation, where a host has to go looking for it.
 *
 * The typed word is a misclick guard, not a security control — the server action
 * re-checks both permission and the typed word, and reads the required word from
 * the same constant this component does so the two can never drift apart.
 */
export function DangerZone({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, deleteProperty] = useFormState<PropertyFormState, FormData>(deletePropertyAction, {});
  const inputRef = useRef<HTMLInputElement>(null);

  // Comparison mirrors the server's `isDeleteConfirmed`: forgiving about case
  // and surrounding whitespace, because mobile keyboards add both, and strict
  // about everything else.
  const confirmed = typed.trim().toLowerCase() === DELETE_CONFIRMATION_WORD;

  // Focus the field as soon as the dialog opens so a keyboard user is not left
  // hunting for it, and reset the typed value on close so reopening never
  // presents a pre-armed delete button.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="card" style={{ padding: '1.5rem', marginTop: 0, borderColor: 'var(--coral)' }}>
      <h2 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.5rem' }}>
        <AlertTriangle size={16} aria-hidden style={{ color: 'var(--coral)' }} />
        Delete this property
      </h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem', maxWidth: '46rem' }}>
        Permanently erases this property and everything attached to it — its Brain, uploaded documents, guest
        conversations, stays, service requests, and portal links. This cannot be undone and we cannot recover it for you.
        If you only want it out of your way, <strong>archive</strong> it instead — archived properties move to Reports and
        can be restored at any time.
      </p>
      {state.error ? (
        <div className="alert alert-error" role="alert" style={{ fontSize: '.82rem', marginBottom: '.75rem' }}>
          {state.error}
        </div>
      ) : null}
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)} data-testid="property-delete-open">
        Delete permanently
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="property-delete-title"
          data-testid="property-delete-dialog"
          onClick={(e) => {
            // Click-outside closes. Guarded to the backdrop itself so a click
            // that started inside the card cannot dismiss a half-typed
            // confirmation.
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(4,8,14,0.72)', backdropFilter: 'blur(4px)',
            display: 'grid', placeItems: 'center', padding: '1rem',
          }}
        >
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: '1.5rem' }}>
            <h3 id="property-delete-title" style={{ fontSize: '1.15rem', marginBottom: '.5rem' }}>
              Delete “{propertyName}” for good?
            </h3>
            <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
              Everything attached to this property will be erased immediately and permanently. There is no undo and no
              backup we can restore from.
            </p>
            <form action={deleteProperty}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <label htmlFor="property-delete-confirm" style={{ display: 'block', fontSize: '.82rem', marginBottom: '.35rem' }}>
                Type <strong>{DELETE_CONFIRMATION_WORD}</strong> to confirm
              </label>
              <input
                ref={inputRef}
                id="property-delete-confirm"
                name="confirm"
                className="input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={DELETE_CONFIRMATION_WORD}
                aria-describedby="property-delete-hint"
                data-testid="property-delete-confirm"
                style={{ marginBottom: '.4rem' }}
              />
              <p id="property-delete-hint" className="faint" style={{ fontSize: '.75rem', marginBottom: '1rem' }}>
                {confirmed ? 'Confirmed. The delete button below is now active.' : 'The delete button stays disabled until this matches.'}
              </p>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/*
                  Wrapped in a disabled fieldset rather than given a `disabled`
                  prop: SubmitButton owns its own disabled state for the pending
                  spinner, and a disabled fieldset blocks submission of what is
                  inside it without fighting that. Only the submit is wrapped, so
                  Cancel stays reachable at all times.
                */}
                <fieldset disabled={!confirmed} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                  <SubmitButton className="btn btn-coral" testId="property-delete-submit">
                    Delete permanently
                  </SubmitButton>
                </fieldset>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} data-testid="property-delete-cancel">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
