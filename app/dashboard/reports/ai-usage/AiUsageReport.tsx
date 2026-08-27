'use client';

import type { Row } from '@tanstack/react-table';
import { ReportGrid, textColumn, type ReportGridColumn } from '@/components/reports/ReportGrid';

/**
 * One display-ready row of the AI usage grid. All formatting happens in the
 * server page — plain JSON across the server→client boundary.
 */
export interface AiUsageReportRow {
  id: string;
  when: string;
  /** Epoch sort key: the display string would sort wrongly as text. */
  whenTs: number;
  property: string;
  kind: string;
  model: string;
  tokens: number;
  cost: string;
  cache: string;
  latency: string;
  /** Numeric sort key for the formatted latency string. */
  latencyMs: number;
}

function whenSort(rowA: Row<AiUsageReportRow>, rowB: Row<AiUsageReportRow>) {
  return rowA.original.whenTs - rowB.original.whenTs;
}

function latencySort(rowA: Row<AiUsageReportRow>, rowB: Row<AiUsageReportRow>) {
  return rowA.original.latencyMs - rowB.original.latencyMs;
}

const columns: ReportGridColumn<AiUsageReportRow>[] = [
  { id: 'when', header: 'When', accessorKey: 'when', sortingFn: whenSort, enableColumnFilter: false },
  textColumn<AiUsageReportRow>('property', 'Property', 'property'),
  textColumn<AiUsageReportRow>('kind', 'Kind', 'kind'),
  textColumn<AiUsageReportRow>('model', 'Model', 'model'),
  { id: 'tokens', header: 'Tokens', accessorKey: 'tokens', sortingFn: 'basic', enableColumnFilter: false },
  { id: 'cost', header: 'Est. cost', accessorKey: 'cost', enableSorting: false, enableColumnFilter: false },
  textColumn<AiUsageReportRow>('cache', 'Cache', 'cache'),
  { id: 'latency', header: 'Latency', accessorKey: 'latency', sortingFn: latencySort, enableColumnFilter: false },
];

export function AiUsageReport({
  rows,
  printSubtitle,
  totalCount,
}: {
  rows: AiUsageReportRow[];
  printSubtitle: string;
  totalCount: number;
}) {
  return (
    <ReportGrid
      rows={rows}
      columns={columns}
      topic="AI usage"
      printSubtitle={printSubtitle}
      defaultSort={[{ id: 'when', desc: true }]}
      totalCount={totalCount}
      emptyMessage="No AI usage recorded for this view. Usage telemetry appears after the concierge answers a question or ingests a document."
    />
  );
}
