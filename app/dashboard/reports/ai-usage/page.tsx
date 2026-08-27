import Link from 'next/link';
import { Cpu } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { fmtDateTimeInTz } from '@/lib/reports/format';
import { AiUsageReport, type AiUsageReportRow } from './AiUsageReport';

export const dynamic = 'force-dynamic';

const ROW_CAP = 500;

const KIND_OPTIONS = ['chat', 'ingest'] as const;

function humanizeToken(value: string | null | undefined): string {
  if (!value) return '—';
  const words = value.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  // Per-call costs run to fractions of a cent, so four decimals stay honest.
  return `$${value.toFixed(4)}`;
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

interface AiUsageSearchParams {
  property?: string;
  from?: string;
  to?: string;
  kind?: string;
}

type AiUsageRow = {
  id: string;
  property_id: string | null;
  kind: string;
  model: string | null;
  total_tokens: number | null;
  est_cost_usd: number | null;
  cache_hit: boolean | null;
  latency_ms: number | null;
  created_at: string;
};

export default async function AiUsageReportPage({
  searchParams,
}: {
  searchParams?: Promise<AiUsageSearchParams>;
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
  const kind = KIND_OPTIONS.includes(sp.kind as (typeof KIND_OPTIONS)[number]) ? (sp.kind as string) : null;

  let rows: AiUsageReportRow[] = [];
  let totalCount = 0;

  // ai_usage is service-role only by design (RLS denies anon/authenticated —
  // telemetry is written fire-and-forget by server routes). Without a service
  // key the grid renders its empty state rather than failing.
  if (scopeIds.length > 0 && hasServiceRole()) {
    const admin = createAdminClient();
    let query = admin
      .from('ai_usage')
      .select('*', { count: 'exact' })
      .in('property_id', scopeIds)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP);
    if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
    if (kind) query = query.eq('kind', kind);

    const { data: usageData, count } = await query;
    totalCount = count ?? 0;
    const usage = (usageData ?? []) as AiUsageRow[];

    rows = usage.map((u) => ({
      id: u.id,
      when: fmtDateTimeInTz(u.created_at, u.property_id ? propTimezones.get(u.property_id) : null),
      whenTs: new Date(u.created_at).getTime(),
      property: (u.property_id && propNames.get(u.property_id)) ?? 'Property',
      kind: humanizeToken(u.kind),
      model: u.model ?? '—',
      tokens: u.total_tokens ?? 0,
      cost: fmtUsd(u.est_cost_usd === null || u.est_cost_usd === undefined ? null : Number(u.est_cost_usd)),
      cache: u.cache_hit ? 'Hit' : 'Miss',
      latency: fmtLatency(u.latency_ms),
      latencyMs: u.latency_ms ?? 0,
    }));
  }

  const printSubtitle = [
    `Property: ${activeProperty ? propNames.get(activeProperty) ?? 'Property' : 'All properties'}`,
    `When: ${from ?? 'any'} → ${to ?? 'any'}`,
    `Kind: ${kind ? humanizeToken(kind) : 'All'}`,
  ].join(' · ');

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 .35rem', fontSize: '.82rem' }}>
          <Link href="/dashboard/reports" className="muted">
            ← Reports
          </Link>
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <Cpu size={20} aria-hidden /> AI usage
        </h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Every concierge call and knowledge ingestion, as a spreadsheet: model, tokens, estimated cost, cache hits,
          and latency. Sort any column, drag columns into the order you want, filter, print, or export exactly what
          you see. Refreshing the page restores the default view.
        </p>
      </div>

      <PropertyFilter
        properties={propList.map((p) => ({ id: p.id, name: p.display_name }))}
        activeId={activeProperty}
        basePath="/dashboard/reports/ai-usage"
      />

      <form
        method="get"
        className="card"
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
          From
          <input className="input" type="date" name="from" defaultValue={from ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          To
          <input className="input" type="date" name="to" defaultValue={to ?? ''} style={{ minHeight: 40, width: 'auto' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem', fontWeight: 600 }} className="muted">
          Kind
          <select className="select" name="kind" defaultValue={kind ?? ''} style={{ minHeight: 40, width: 'auto' }}>
            <option value="">All</option>
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {humanizeToken(k)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-sm" data-testid="ai-usage-filters-apply">
          Apply
        </button>
        <Link href="/dashboard/reports/ai-usage" className="btn btn-ghost btn-sm" data-testid="ai-usage-filters-reset">
          Reset
        </Link>
      </form>

      <AiUsageReport rows={rows} printSubtitle={printSubtitle} totalCount={totalCount} />
    </div>
  );
}
