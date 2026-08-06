'use client';

import { useEffect, useRef } from 'react';

// Per-digit visit-code entry for guests (P6-01).
//
// WHY THIS REPLACES A SINGLE INPUT
// --------------------------------
// The previous control was one text input with maxLength={4}. Even with
// inputMode="numeric", iOS and several Android keyboards surface a full
// alphanumeric keyboard for a plain text input inside a form, and none of them
// offer the OS-level "fill from SMS" affordance. Four separate inputs with
// autoComplete="one-time-code" get the numeric pad plus the SMS autofill
// suggestion, which matters because the code arrives by SMS.
//
// Behaviour contract:
//   - typing a digit advances to the next box
//   - Backspace on an empty box moves back and clears the previous digit
//   - arrow keys move between boxes
//   - pasting "1234" (or "1 2 3 4", or an SMS body containing it) fills all boxes
//   - onComplete fires exactly once per completed 4-digit value
//   - every box is at least 48x56, comfortably past the 44px minimum touch target
//   - error state shakes once, and is suppressed under prefers-reduced-motion
//
// The component is controlled: the parent owns the string. That keeps the
// submit/disable logic in one place and avoids a second source of truth.

const LENGTH = 4;

export function CodeInput(props: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  accent: string;
  /** Accessible name for the group. */
  label: string;
}) {
  const { value, onChange, onComplete, disabled, error, accent, label } = props;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  // Guards onComplete against firing twice for the same value (React can call
  // effects more than once, and a re-render on `error` must not resubmit).
  const completedFor = useRef<string | null>(null);

  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (value.length === LENGTH && completedFor.current !== value) {
      completedFor.current = value;
      onComplete?.(value);
    }
    if (value.length < LENGTH) completedFor.current = null;
  }, [value, onComplete]);

  // On a wrong code the parent clears the value; put the caret back at the start
  // so the guest can retype immediately without tapping.
  useEffect(() => {
    if (error && value.length === 0) refs.current[0]?.focus();
  }, [error, value.length]);

  function setDigitAt(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').replace(/\D/g, '').slice(0, LENGTH));
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigitAt(index, '');
      return;
    }
    // Multi-character input means a paste or an autofill: spread it forward.
    if (cleaned.length > 1) {
      const merged = (value.slice(0, index) + cleaned).replace(/\D/g, '').slice(0, LENGTH);
      onChange(merged);
      const focusAt = Math.min(merged.length, LENGTH - 1);
      refs.current[focusAt]?.focus();
      return;
    }
    setDigitAt(index, cleaned);
    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        setDigitAt(index, '');
        return;
      }
      if (index > 0) {
        e.preventDefault();
        setDigitAt(index - 1, '');
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="code-input"
      data-error={error ? 'true' : undefined}
      className={error ? 'mo-code mo-code-error' : 'mo-code'}
      style={{
        display: 'flex',
        gap: '.5rem',
        justifyContent: 'center',
        marginBottom: '.75rem',
      }}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          // One-time-code autofill only attaches to the first field; the rest are
          // filled by the paste-spreading path above.
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={i === 0}
          inputMode="numeric"
          pattern="[0-9]*"
          type="tel"
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          data-testid={`input-code-digit-${i + 1}`}
          style={{
            width: 56,
            height: 60,
            textAlign: 'center',
            fontSize: '1.6rem',
            fontWeight: 700,
            padding: 0,
            borderRadius: 12,
            border: `1px solid ${error ? '#ff6b6b' : digit ? accent : 'rgba(255,255,255,0.18)'}`,
            background: 'var(--bg-2, rgba(255,255,255,0.05))',
            color: 'var(--text, #E9EEF5)',
            WebkitTextFillColor: 'var(--text, #E9EEF5)',
            caretColor: accent,
            outlineColor: accent,
            transition: 'border-color .15s',
          }}
        />
      ))}
      <style jsx>{`
        .mo-code-error {
          animation: mo-shake 0.32s ease-in-out;
        }
        @keyframes mo-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-6px);
          }
          40% {
            transform: translateX(6px);
          }
          60% {
            transform: translateX(-3px);
          }
          80% {
            transform: translateX(3px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .mo-code-error {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
