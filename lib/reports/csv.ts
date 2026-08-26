// CSV export for the Reports grid (#81). The string building is pure and
// unit-testable; only the download helper touches the browser.

/**
 * Serialize one grid view to CSV. A UTF-8 BOM is prepended so Excel on Windows
 * detects the encoding — without it, accented guest names mojibake on open.
 */
export function toCsv(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const escapeCell = (value: string | number | null | undefined): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

/** Trigger a client-side download of already-built CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
