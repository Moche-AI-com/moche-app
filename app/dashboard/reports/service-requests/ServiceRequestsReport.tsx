'use client';

import Link from 'next/link';
import type { Row } from '@tanstack/react-table';
import { Printer } from 'lucide-react';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the Service reports grid. All formatting happens in
 * the server page — this type is plain JSON across the server→client boundary,
 * and every filterable/sortable cell value is a string or number.
 */
export interface ServiceReportRow {
  id: string;
  summary: string;
  property: string;
  serviceType: string;
  urgency: string;
  status: string;
  requested: string;
  resolvedOn: string;
  /** Epoch sort keys: the display strings ("Aug 20, 2026") would sort wrongly as text. */
  requestedTs: number;
  resolvedTs: number;
}

function tsSort(key: 'requestedTs' | 'resolvedTs') {
  return (rowA: Row<ServiceReportRow>, rowB: Row<ServiceReportRow>) => rowA.original[key] - rowB.original[key];
}

const columns: ReportGridColumn<ServiceReportRow>[] = [
  {
    id: 'summary',
    header: 'Summary',
    accessorKey: 'summary',
    filterFn: 'includesString',
    // First cell carries the per-row detail link (past-stays pattern): the full
    // printable record for a contractor, an owner, or the host's own files. The
    // report page lives under the Service tab, not the Reports section.
    cell: ({ row }) => (
      <Link
        href={`/dashboard/service-requests/${row.original.id}`}
        className="rg-cell-link"
        style={{ color: 'var(--teal)', fontWeight: 600 }}
        data-testid={`service-report-link-${row.original.id}`}
      >
        <Printer size={11} aria-hidden style={{ marginRight: 4, verticalAlign: '-1px' }} />
        {row.original.summary}
      </Link>
    ),
  },
  textColumn<ServiceReportRow>('property', 'Property', 'property'),
  textColumn<ServiceReportRow>('serviceType', 'Type', 'serviceType'),
  textColumn<ServiceReportRow>('urgency', 'Urgency', 'urgency'),
  textColumn<ServiceReportRow>('status', 'Status', 'status'),
  { id: 'requested', header: 'Requested', accessorKey: 'requested', sortingFn: tsSort('requestedTs'), enableColumnFilter: false },
  { id: 'resolvedOn', header: 'Resolved', accessorKey: 'resolvedOn', sortingFn: tsSort('resolvedTs'), enableColumnFilter: false },
];

export function ServiceRequestsReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: ServiceReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="Service reports"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'resolvedOn', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No resolved service requests match this view. Requests land here when they are resolved or closed."
    />
  );
}
