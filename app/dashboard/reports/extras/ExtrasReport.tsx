'use client';

import type { Row } from '@tanstack/react-table';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the Completed extras grid. All formatting happens in
 * the server page — plain JSON across the server→client boundary.
 */
export interface ExtrasReportRow {
  id: string;
  item: string;
  property: string;
  quantity: number;
  price: string;
  status: string;
  requested: string;
  completed: string;
  /** Epoch sort keys: the display strings would sort wrongly as text. */
  requestedTs: number;
  completedTs: number;
}

function tsSort(key: 'requestedTs' | 'completedTs') {
  return (rowA: Row<ExtrasReportRow>, rowB: Row<ExtrasReportRow>) => rowA.original[key] - rowB.original[key];
}

const columns: ReportGridColumn<ExtrasReportRow>[] = [
  textColumn<ExtrasReportRow>('item', 'Item', 'item'),
  textColumn<ExtrasReportRow>('property', 'Property', 'property'),
  { id: 'quantity', header: 'Qty', accessorKey: 'quantity', sortingFn: 'basic', enableColumnFilter: false },
  textColumn<ExtrasReportRow>('price', 'Price', 'price'),
  textColumn<ExtrasReportRow>('status', 'Status', 'status'),
  { id: 'requested', header: 'Requested', accessorKey: 'requested', sortingFn: tsSort('requestedTs'), enableColumnFilter: false },
  { id: 'completed', header: 'Completed', accessorKey: 'completed', sortingFn: tsSort('completedTs'), enableColumnFilter: false },
];

export function ExtrasReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: ExtrasReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="Completed extras"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'completed', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No completed extras match this view. Orders land here when they are fulfilled, declined, or cancelled."
    />
  );
}
