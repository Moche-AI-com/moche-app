'use client';

import type { Row } from '@tanstack/react-table';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the Past stays grid. All formatting happens in the
 * server page — this type is plain JSON across the server→client boundary, and
 * every filterable/sortable cell value is a string or number.
 */
export interface StayReportRow {
  id: string;
  reference: string;
  guest: string;
  party: string;
  property: string;
  checkIn: string;
  checkOut: string;
  /** Epoch sort keys: the display strings ("Aug 20, 2026") would sort wrongly as text. */
  checkInTs: number;
  checkOutTs: number;
  nights: number;
  status: string;
  language: string;
  createdBy: string;
  conversations: number;
  escalations: number;
  extras: number;
}

function tsSort(key: 'checkInTs' | 'checkOutTs') {
  return (rowA: Row<StayReportRow>, rowB: Row<StayReportRow>) => rowA.original[key] - rowB.original[key];
}

const columns: ReportGridColumn<StayReportRow>[] = [
  textColumn<StayReportRow>('reference', 'Stay ref', 'reference'),
  textColumn<StayReportRow>('guest', 'Guest', 'guest'),
  textColumn<StayReportRow>('party', 'Party', 'party'),
  textColumn<StayReportRow>('property', 'Property', 'property'),
  { id: 'checkIn', header: 'Check-in', accessorKey: 'checkIn', sortingFn: tsSort('checkInTs'), enableColumnFilter: false },
  { id: 'checkOut', header: 'Check-out', accessorKey: 'checkOut', sortingFn: tsSort('checkOutTs'), enableColumnFilter: false },
  { id: 'nights', header: 'Nights', accessorKey: 'nights', sortingFn: 'basic', enableColumnFilter: false },
  textColumn<StayReportRow>('status', 'Status', 'status'),
  textColumn<StayReportRow>('language', 'Language', 'language'),
  textColumn<StayReportRow>('createdBy', 'Created by', 'createdBy'),
  { id: 'conversations', header: 'Chats', accessorKey: 'conversations', sortingFn: 'basic', enableColumnFilter: false },
  { id: 'escalations', header: 'Escalations', accessorKey: 'escalations', sortingFn: 'basic', enableColumnFilter: false },
  { id: 'extras', header: 'Extras', accessorKey: 'extras', sortingFn: 'basic', enableColumnFilter: false },
];

export function StaysReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: StayReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="Past stays"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'checkOut', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No past stays match this view. Completed and revoked stays land here automatically at checkout."
    />
  );
}
