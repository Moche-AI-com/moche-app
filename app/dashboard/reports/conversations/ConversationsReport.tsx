'use client';

import type { Row } from '@tanstack/react-table';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the Concierge activity grid. All formatting happens
 * in the server page — plain JSON across the server→client boundary.
 */
export interface ConversationReportRow {
  id: string;
  guest: string;
  property: string;
  channel: string;
  messages: number;
  topIntent: string;
  escalations: number;
  avgConfidence: string;
  lastActive: string;
  /** Epoch sort key: the display string would sort wrongly as text. */
  lastActiveTs: number;
}

function lastActiveSort(rowA: Row<ConversationReportRow>, rowB: Row<ConversationReportRow>) {
  return rowA.original.lastActiveTs - rowB.original.lastActiveTs;
}

const columns: ReportGridColumn<ConversationReportRow>[] = [
  textColumn<ConversationReportRow>('guest', 'Guest', 'guest'),
  textColumn<ConversationReportRow>('property', 'Property', 'property'),
  textColumn<ConversationReportRow>('channel', 'Channel', 'channel'),
  { id: 'messages', header: 'Messages', accessorKey: 'messages', sortingFn: 'basic', enableColumnFilter: false },
  textColumn<ConversationReportRow>('topIntent', 'Top intent', 'topIntent'),
  { id: 'escalations', header: 'Escalations', accessorKey: 'escalations', sortingFn: 'basic', enableColumnFilter: false },
  { id: 'avgConfidence', header: 'Avg confidence', accessorKey: 'avgConfidence', enableSorting: false, enableColumnFilter: false },
  { id: 'lastActive', header: 'Last active', accessorKey: 'lastActive', sortingFn: lastActiveSort, enableColumnFilter: false },
];

export function ConversationsReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: ConversationReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="Concierge activity"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'lastActive', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No conversations match this view. Guest chats appear here as soon as a guest opens a portal."
    />
  );
}
