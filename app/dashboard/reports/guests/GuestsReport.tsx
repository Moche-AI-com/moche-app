'use client';

import type { Row } from '@tanstack/react-table';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the Guest directory grid. All formatting happens in
 * the server page — plain JSON across the server→client boundary.
 */
export interface GuestReportRow {
  id: string;
  guest: string;
  property: string;
  contact: string;
  added: string;
  /** Epoch sort key: the display string would sort wrongly as text. */
  addedTs: number;
}

function addedSort(rowA: Row<GuestReportRow>, rowB: Row<GuestReportRow>) {
  return rowA.original.addedTs - rowB.original.addedTs;
}

const columns: ReportGridColumn<GuestReportRow>[] = [
  textColumn<GuestReportRow>('guest', 'Guest', 'guest'),
  textColumn<GuestReportRow>('property', 'Property', 'property'),
  textColumn<GuestReportRow>('contact', 'Contact', 'contact'),
  { id: 'added', header: 'Added', accessorKey: 'added', sortingFn: addedSort, enableColumnFilter: false },
];

export function GuestsReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: GuestReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="Guest directory"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'added', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No guests match this view. Guests appear here when they register through a property's portal."
    />
  );
}
