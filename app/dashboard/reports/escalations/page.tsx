import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateInTz } from '@/lib/reports/format';
import type { Database } from '@/lib/database.types';
import { EscalationsReport, type EscalationReportRow } from './EscalationsReport';

export const dynamic = 'force-dynamic';

const ROW_CAP = 500;

type EscalationStatus = Database['public']['Enums']['escalation_status'];

// Anything but 'open' is archived history.
const STATUS_OPTIONS: readonly EscalationStatus[] = ['resolved', 'answered', 'dismissed'];

const STATUS_LABEL: Record<string, string> = {
  resolved: 'Handled',
  answered: 'Answered',
  dismissed: 'Cancelled',
};

function humanizeToken(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface EscalationsSearchParams {
  property?: string;
  from?: string;
  to?: string;
  status?: string;
}

type EscalationRow = {
  id: string;
  property_id: string;
  question: string;
  status: string;
  host_response: string | null;
  created_at: string;
  responded_at: string | null;
  conversation_id: string | null;
};

export default async function HandledEscalationsReportPage({
  searchParams,
}: {
  searchParams?: Promise<EscalationsSearchParams>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  // Tombstone rule: names cover permanently deleted properties too.
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, deleted_at, timezone')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');
  const allProps = properties ?? [];
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  const propTimezones = new Map(allProps.map((p) => [p.id, p.timezone ?? null]));
  const propList = allProps.filter((p) => p.deleted_at === null);

  const requested = typeof sp.property === 'string' ? sp.property : null;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  // Narrow to the escalation_status union — a plain string fails typecheck.
  const status = STATUS_OPTIONS.includes(sp.status as EscalationStatus)
    ? (sp.status as EscalationStatus)
    : null;

  let rows: EscalationReportRow[] = [];
  let totalCount = 0;

  if (scopeIds.length > 0) {
    // Anything no longer open, answered-most-recent-first.
    let query = supabase
      .from('escalations')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .neq('status', 'open')
      .order('responded_at', { ascending: false, nullsFirst: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
    if (status) query = query.eq('status', status);

    const { data: escData, count } = await query;
    totalCount = count ?? 0;
    const escalations = (escData ?? []) as EscalationRow[];

    rows = escalations.map((e) => ({
      id: e.id,
      question: e.question,
      property: propNames.get(e.property_id) ?? 'Property',
      status: STATUS_LABEL[e.status] ?? humanizeToken(e.status),
      response: e.host_response?.trim() || '—',
      asked: fmtDateInTz(e.created_at, propTimezones.get(e.property_id)),
      handled: fmtDateInTz(e.responded_at, propTimezones.get(e.property_id)),
      askedTs: new Date(e.created_at).getTime(),
      handledTs: e.responded_at ? new Date(e.responded_at).getTime() : 0,
      // conversations has no escalation back-reference; the link lives on the
      // escalation row itself, so a thread count is exactly "has a thread".
      conversations: e.conversation_id ? 1 : 0,
    }));
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `Asked: ${from ?? 'any'} → ${to ?? 'any'}`,
    `Status: ${status ? STATUS_LABEL[status] ?? humanizeToken(status) : 'All'}`,
  ].join(' · ');

  return (
    <div>
      <div className="no-print" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 .35rem', fontSize: '.82rem' }}>
          <Link href="/dashboard/reports" className="muted">
            ← Reports
          </Link>
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <MessageSquare size={20} aria-hidden /> Handled escalations
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every guest question your team answered personally, as a spreadsheet: sort any column, drag columns into
          the order you want, filter by question, property, or response, then print or export exactly what you see.
          Open a row to see the full thread and choose which replies train the concierge. Refreshing the page
          restores the default view.
        </p>
      </div>

      <div className="no-print">
        <PropertyFilter
          properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
          activeId={activeProperty}
          basePath="/dashboard/reports/escalations"
        />
      </div>

      <form
        method="get"
        className="card no-print"
        style={{
          padding: '.9rem 1rem',
          margin: '.85rem 0 1.1rem',
          display: 'flex',
          gap: '.75rem',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        {activeProperty ? <input type="hidden" name="property" value={activeProperty} /> : null}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Asked from
          <input className="input" type="date" name="from" defaultValue={from ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Asked to
          <input className="input" type="date" name="to" defaultValue={to ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Status
          <select className="select" name="status" defaultValue={status ?? ''} style={{ minHeight: 40, width: 'auto' }}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? humanizeToken(s)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="escalations-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/escalations" className="btn btn-ghost btn-sm" data-testid="escalations-filters-reset">
          Reset
        </Link>
      </form>

      <EscalationsReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
