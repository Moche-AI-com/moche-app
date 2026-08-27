'use client';

import Link from 'next/link';
import type { Row } from '@tanstack/react-table';
import { MessageSquare } from 'lucide-react';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the Handled escalations grid. All formatting happens
 * in the server page — plain JSON across the server→client boundary.
 */
export interface EscalationReportRow {
  id: string;
  question: string;
  property: string;
  status: string;
  response: string;
  asked: string;
  handled: string;
  /** Epoch sort keys: the display strings would sort wrongly as text. */
  askedTs: number;
  handledTs: number;
  conversations: number;
}

function tsSort(key: 'askedTs' | 'handledTs') {
  return (rowA: Row<EscalationReportRow>, rowB: Row<EscalationReportRow>) => rowA.original[key] - rowB.original[key];
}

const columns: ReportGridColumn<EscalationReportRow>[] = [
  {
    id: 'question',
    header: 'Question',
    accessorKey: 'question',
    filterFn: 'includesString',
    // First cell carries the per-row detail link: the escalation page, which
    // redirects into the guest's Host Chat thread when one exists.
    cell: ({ row }) => (
      <Link
        href={`/dashboard/escalations/${row.original.id}`}
        style={{ color: 'var(--teal)', fontWeight: 600 }}
        data-testid={`escalation-report-link-${row.original.id}`}
      >
        <MessageSquare size={11} aria-hidden style={{ marginRight: 4, verticalAlign: '-1px' }} />
        {row.original.question}
      </Link>
    ),
  },
  textColumn<EscalationReportRow>('property', 'Property', 'property'),
  textColumn<EscalationReportRow>('status', 'Status', 'status'),
  textColumn<EscalationReportRow>('response', 'Your reply', 'response'),
  { id: 'asked', header: 'Asked', accessorKey: 'asked', sortingFn: tsSort('askedTs'), enableColumnFilter: false },
  { id: 'handled', header: 'Handled', accessorKey: 'handled', sortingFn: tsSort('handledTs'), enableColumnFilter: false },
  { id: 'conversations', header: 'Chats', accessorKey: 'conversations', sortingFn: 'basic', enableColumnFilter: false },
];

export function EscalationsReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: EscalationReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="Handled escalations"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'handled', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No handled escalations match this view. Closed escalations land here automatically."
    />
  );
}
