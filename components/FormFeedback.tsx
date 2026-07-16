'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, className = 'btn btn-primary btn-block' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>;
  if (success) return <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{success}</div>;
  return null;
}
