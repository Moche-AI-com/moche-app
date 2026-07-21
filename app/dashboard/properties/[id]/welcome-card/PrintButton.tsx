'use client';

// Print / Save-as-PDF via the browser's native print dialog. Satisfies both the printable
// page and the "downloadable PDF" requirement at $0 with no server PDF library.
export function PrintButton() {
  return (
    <button className="btn btn-primary btn-sm" onClick={() => window.print()} data-testid="button-print-welcome">
      Print / Save as PDF
    </button>
  );
}
