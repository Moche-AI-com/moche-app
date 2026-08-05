'use client';

import { Printer } from 'lucide-react';

// window.print() needs a client component, so it is isolated here rather than
// making the whole report page client-rendered for one button.
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()} data-testid="print-button">
      <Printer size={13} aria-hidden /> {label}
    </button>
  );
}
