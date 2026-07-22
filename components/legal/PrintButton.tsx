'use client';

// Small client button — the legal layout is otherwise a server component.
export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm no-print"
      onClick={() => window.print()}
      data-testid="legal-print"
    >
      Print / Save as PDF
    </button>
  );
}
