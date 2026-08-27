'use client';

import { useEffect, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Header,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, GripVertical, Printer } from 'lucide-react';
import { downloadCsv, toCsv } from '@/lib/reports/csv';
import { DomeMark } from '@/components/Logo';

/**
 * ReportGrid — the shared spreadsheet-style table behind every Reports topic
 * (Reports rework, issue #81).
 *
 * Topic pages are server components that fetch and pre-format rows; this client
 * component owns everything interactive: header click-sort (asc → desc →
 * none), drag-to-reorder columns via the grip handle (dnd-kit,
 * keyboard-accessible), per-column text filters, column visibility, CSV
 * export, and print.
 *
 * State contract — a product requirement, not an implementation detail:
 * sorting, column order, column filters, and column visibility live in React
 * memory ONLY. Nothing is written to localStorage, cookies, or the URL, so a
 * page refresh always restores the default view. Do not add persistence here
 * without a product decision reversing that requirement.
 *
 * Print and CSV both export the grid exactly as arranged on screen: visible
 * columns in their current order, current sort, and current column filters.
 */

// Every column needs an explicit string `id` (column-order state and the drag
// handles key off it) and a plain-string `header` (used for the sort label,
// the CSV header row, and the Columns visibility checklist).
export type ReportGridColumn<TRow> = ColumnDef<TRow, any> & { id: string; header: string };

/**
 * Standard text column: case-insensitive substring filter + alphanumeric sort.
 * Date and numeric columns declare their own sortingFn instead (see the Stays
 * topic for the pattern).
 */
export function textColumn<TRow>(
  id: string,
  header: string,
  accessorKey: keyof TRow & string,
  opts?: { sortable?: boolean; filterable?: boolean },
): ReportGridColumn<TRow> {
  return {
    id,
    header,
    accessorKey,
    filterFn: 'includesString',
    enableSorting: opts?.sortable ?? true,
    enableColumnFilter: opts?.filterable ?? true,
  };
}

export interface ReportGridProps<TRow> {
  rows: TRow[];
  columns: ReportGridColumn<TRow>[];
  /** Topic name for the print header + CSV filename, e.g. "Past stays". */
  topic: string;
  /** One line describing the active server-side filters; printed above the grid. */
  printSubtitle?: string;
  defaultSort?: SortingState;
  emptyMessage?: string;
  /** Server-side total when the fetch was capped; the toolbar shows "N of M". */
  totalCount?: number;
}

function SortableHeaderCell<TRow>({ header }: { header: Header<TRow, unknown> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: header.column.id,
  });
  const sorted = header.column.getIsSorted();
  const label = header.column.columnDef.header as string;

  return (
    <th
      ref={setNodeRef}
      className={isDragging ? 'rg-th rg-dragging' : 'rg-th'}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
    >
      <div className="rg-th-inner">
        {header.column.getCanSort() ? (
          <button
            type="button"
            className="rg-sort"
            onClick={header.column.getToggleSortingHandler()}
            data-testid={`rg-sort-${header.column.id}`}
          >
            <span className="rg-th-label">{label}</span>
            {sorted === 'asc' ? (
              <ArrowUp size={12} aria-hidden />
            ) : sorted === 'desc' ? (
              <ArrowDown size={12} aria-hidden />
            ) : (
              <ArrowUpDown size={12} aria-hidden className="rg-sort-hint" />
            )}
          </button>
        ) : (
          <span className="rg-th-label">{label}</span>
        )}
        <button
          type="button"
          className="rg-grip"
          aria-label={`Drag to reorder the ${label} column`}
          data-testid={`rg-drag-${header.column.id}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} aria-hidden />
        </button>
      </div>
    </th>
  );
}

export function ReportGrid<TRow>({
  rows,
  columns,
  topic,
  printSubtitle,
  defaultSort,
  emptyMessage,
  totalCount,
}: ReportGridProps<TRow>) {
  // All grid state is in-memory by design (see the state contract above).
  const [sorting, setSorting] = useState<SortingState>(defaultSort ?? []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(columns.map((c) => c.id));
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  // Rendered after mount only: a live timestamp rendered during SSR would
  // hydrate-mismatch. It reflects when the page was loaded, which is what a
  // printed report needs.
  const [printedAt, setPrintedAt] = useState<string | null>(null);
  useEffect(() => {
    setPrintedAt(
      new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
  }, []);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, columnOrder, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const sensors = useSensors(
    // A few px of movement before a drag starts lets a plain click on the
    // header still reach the sort button.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((order) => {
      const from = order.indexOf(String(active.id));
      const to = order.indexOf(String(over.id));
      return from === -1 || to === -1 ? order : arrayMove(order, from, to);
    });
  }

  // getRowModel() is the post-filter, post-sort row model — exactly what CSV
  // and print should export.
  const visibleColumns = table.getVisibleLeafColumns();
  const shownRows = table.getRowModel().rows;
  const hasFilters = table.getAllLeafColumns().some((c) => c.getCanFilter());

  function exportCsv() {
    const headers = visibleColumns.map((c) => c.columnDef.header as string);
    const body = shownRows.map((row) =>
      visibleColumns.map((c) => {
        const value = row.getValue(c.id);
        return value === null || value === undefined ? '' : String(value);
      }),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadCsv(`moche-${slug}-${stamp}.csv`, toCsv(headers, body));
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }} data-testid="report-grid-empty">
        <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
          {emptyMessage ?? 'Nothing to show for this view yet.'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="report-grid">
      {/* Print-only letterhead: the client-facing header — brand, topic, the
          server-side filters in force, and when it was generated. */}
      <div className="rg-print-header" aria-hidden>
        <div className="rg-print-brand">
          <DomeMark size={20} variant="mono" />
          <span>Moche-AI</span>
        </div>
        <p className="rg-print-topic">{topic}</p>
        {printSubtitle ? <p className="rg-print-sub">{printSubtitle}</p> : null}
        <p className="rg-print-sub">Generated {printedAt ?? ''}</p>
      </div>

      <div className="rg-toolbar">
        <span className="faint" style={{ fontSize: '.8rem' }} data-testid="rg-count">
          {totalCount && totalCount > rows.length
            ? `Showing ${rows.length} of ${totalCount}`
            : `${shownRows.length} ${shownRows.length === 1 ? 'row' : 'rows'}`}
          {columnFilters.length > 0 && shownRows.length !== rows.length
            ? ` — ${shownRows.length} after filters`
            : ''}
        </span>
        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <details className="rg-cols">
            <summary className="btn btn-ghost btn-sm" data-testid="rg-columns-toggle">Columns</summary>
            <div className="rg-cols-menu card">
              {table.getAllLeafColumns().map((column) => (
                <label key={column.id} className="rg-cols-item">
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                    data-testid={`rg-col-${column.id}`}
                  />
                  {column.columnDef.header as string}
                </label>
              ))}
            </div>
          </details>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv} data-testid="rg-csv">
            <Download size={13} aria-hidden /> CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => window.print()}
            title="Print or save as PDF"
            data-testid="rg-print"
          >
            <Printer size={13} aria-hidden /> Print
          </button>
        </div>
      </div>

      <div className="rg-table-wrap card">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table className="rg-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                    {headerGroup.headers.map((header) => (
                      <SortableHeaderCell key={header.id} header={header} />
                    ))}
                  </SortableContext>
                </tr>
              ))}
              {hasFilters && (
                <tr className="rg-filter-row">
                  {table.getHeaderGroups()[0]?.headers.map((header) => (
                    <th key={`filter-${header.id}`} className="rg-th rg-filter-cell">
                      {header.column.getCanFilter() ? (
                        <input
                          className="input rg-filter-input"
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={(e) => header.column.setFilterValue(e.target.value)}
                          placeholder="Filter…"
                          aria-label={`Filter by ${header.column.columnDef.header as string}`}
                          data-testid={`rg-filter-${header.column.id}`}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {shownRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="rg-cell rg-no-matches">
                    No rows match the current filters.{' '}
                    <button type="button" className="rg-clear" onClick={() => setColumnFilters([])}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                shownRows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="rg-cell" data-testid={`rg-cell-${cell.column.id}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      {/* Print-only footer: the printed page stands alone as a record. */}
      <div className="rg-print-foot" aria-hidden>
        <span>Moche-AI · {topic}</span>
        <span>
          {shownRows.length} {shownRows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {/* Grid styles live here rather than in globals.css so the whole pattern
          ships as one component. Screen rules use the design tokens; the print
          block extends the global @media print rules (which already force a
          light palette and hide the dashboard chrome). */}
      <style jsx global>{`
        .rg-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: .75rem; flex-wrap: wrap; margin-bottom: .6rem;
        }
        .rg-table-wrap { overflow-x: auto; padding: 0; }
        .rg-table { width: 100%; border-collapse: collapse; font-size: .86rem; }
        .rg-th {
          text-align: left; padding: .55rem .6rem; white-space: nowrap;
          border-bottom: 1px solid var(--border-strong); background: var(--surface-2);
        }
        .rg-th-inner { display: flex; align-items: center; gap: .15rem; }
        .rg-th-label {
          font-size: .74rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .05em; color: var(--text-muted);
        }
        .rg-sort {
          display: inline-flex; align-items: center; gap: .3rem;
          background: none; border: 0; padding: .25rem .3rem; margin: 0;
          cursor: pointer; color: inherit; font: inherit; border-radius: 6px;
        }
        .rg-sort:hover { background: var(--surface); }
        .rg-sort-hint { opacity: .45; }
        .rg-grip {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border: 0; background: none; border-radius: 5px;
          color: var(--text-faint); cursor: grab; touch-action: none;
        }
        .rg-grip:hover { color: var(--text); background: var(--surface); }
        .rg-grip:active { cursor: grabbing; }
        .rg-dragging { position: relative; z-index: 5; opacity: .65; }
        .rg-filter-row .rg-th {
          padding: .35rem .6rem; background: var(--surface); border-bottom: 1px solid var(--border);
        }
        .rg-filter-input {
          padding: .35rem .5rem !important; font-size: .78rem !important;
          border-radius: 8px !important; min-width: 7rem; width: 100%;
        }
        .rg-cell {
          padding: .55rem .6rem; border-bottom: 1px solid var(--border);
          color: var(--text); vertical-align: top;
        }
        .rg-table tbody tr:last-child .rg-cell { border-bottom: 0; }
        .rg-table tbody tr:hover .rg-cell { background: var(--surface-2); }
        .rg-no-matches { text-align: center; color: var(--text-muted); padding: 1.5rem 1rem !important; }
        .rg-clear {
          background: none; border: 0; padding: 0; cursor: pointer;
          color: var(--teal); font-weight: 600; text-decoration: underline;
        }
        .rg-cols { position: relative; }
        .rg-cols > summary { list-style: none; cursor: pointer; user-select: none; }
        .rg-cols > summary::-webkit-details-marker { display: none; }
        .rg-cols-menu {
          position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
          padding: .6rem .8rem; min-width: 11rem;
          display: flex; flex-direction: column; gap: .35rem;
        }
        .rg-cols-item {
          display: flex; align-items: center; gap: .45rem;
          font-size: .82rem; color: var(--text); cursor: pointer;
        }
        .rg-print-header, .rg-print-foot, .report-print-brand { display: none; }

        @media (prefers-reduced-motion: reduce) {
          .rg-th { transition: none !important; }
        }

        @media print {
          .rg-toolbar, .rg-filter-row, .rg-grip, .no-print { display: none !important; }
          .rg-print-header {
            display: block; margin-bottom: .9rem; padding-bottom: .65rem;
            border-bottom: 2px solid #000;
          }
          .rg-print-brand, .report-print-brand {
            display: flex; align-items: center; gap: .45rem;
            font-family: var(--font-display); font-weight: 600; font-size: .98rem;
            color: #000;
          }
          .rg-print-brand { margin-bottom: .4rem; }
          .report-print-brand { margin-bottom: 1rem; }
          .rg-print-topic {
            font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin: 0 0 .15rem;
          }
          .rg-print-sub { margin: 0; font-size: .8rem; color: #333; }
          .rg-print-foot {
            display: flex; justify-content: space-between; gap: 1rem;
            margin-top: .9rem; padding-top: .55rem; border-top: 1px solid #ccc;
            font-size: .74rem; color: #333;
          }
          .rg-table-wrap { overflow: visible !important; border: none !important; box-shadow: none !important; }
          .rg-table { font-size: 11px; }
          .rg-table tr { break-inside: avoid; page-break-inside: avoid; }
          .rg-th { background: #fff !important; }
          .rg-sort { cursor: default; }
          .rg-sort svg { display: none; }
        }
      `}</style>
    </div>
  );
}
