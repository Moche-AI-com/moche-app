'use client';

import { useFormStatus } from 'react-dom';

// `name`/`value` let a single form carry more than one submit path (the browser
// only submits the button that was actually clicked), which is how the tone banner
// distinguishes "keep" from "discard" without two separate forms.
export function SubmitButton({
  children,
  className = 'btn btn-primary btn-block',
  testId,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      data-testid={testId}
      name={name}
      value={value}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>;
  if (success) return <div className="alert alert-success" role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>{success}</div>;
  return null;
}
