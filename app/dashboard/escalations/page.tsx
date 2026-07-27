import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { EscalationsList, type EscalationRowData } from './EscalationsList';

export const dynamic = 'force-dynamic';

// Escalations open across a host's entire portfolio, grouped by property so it's always
// clear which listing a question belongs to. Supports an optional ?property=<id> filter
// so hosts managing several properties can focus on one at a time.
export default async function EscalationsPage({
  searchParams,
}: {
  searchParams: { property?: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null)
    .order('display_name', { ascending: true });

  const propList = properties ?? [];
  const propMap = new Map<string, string>(propList.map((p) => [p.id, p.display_name as string]));
  const propertyIds = propList.map((p) => p.id);

  const activeFilter = searchParams.property && propMap.has(searchParams.property) ? searchParams.property : null;

  const { data: escalations } = propertyIds.length
    ? await supabase
        .from('escalations')
        .select('id, property_id, question, status, host_response, created_at, responded_at')
        .in('property_id', activeFilter ? [activeFilter] : propertyIds)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] };

  const rows: EscalationRowData[] = (escalations ?? []).map((e) => ({
    id: e.id as string,
    propertyId: e.property_id as string,
    propertyName: propMap.get(e.property_id as string) ?? 'Unknown property',
    question: e.question as string,
    status: e.status as string,
    hostResponse: (e.host_response as string | null) ?? null,
    createdAt: e.created_at as string,
    respondedAt: (e.responded_at as string | null) ?? null,
  }));

  // Open-escalation counts per property drive the filter pill badges — the number a
  // host actually cares about when deciding where to focus first.
  const openCountByProperty = new Map<string, number>();
  for (const r of rows) {
    if (r.status === 'open') openCountByProperty.set(r.propertyId, (openCountByProperty.get(r.propertyId) ?? 0) + 1);
  }
  // Recompute against the *unfiltered* set so pill counts stay accurate while a filter is active.
  if (activeFilter && propertyIds.length > 1) {
    const { data: allOpen } = await supabase
      .from('escalations')
      .select('property_id')
      .in('property_id', propertyIds)
      .eq('status', 'open');
    openCountByProperty.clear();
    for (const o of allOpen ?? []) {
      const pid = o.property_id as string;
      openCountByProperty.set(pid, (openCountByProperty.get(pid) ?? 0) + 1);
    }
  }

  return (
    <div className="dash-overview">
      <div className="dash-section-head">
        <div>
          <h1 className="dash-section-title">Guest escalations</h1>
          <p className="dash-section-sub">Questions your AI concierge couldn&apos;t answer on its own.</p>
        </div>
      </div>

      <EscalationsList
        rows={rows}
        properties={propList.map((p) => ({ id: p.id as string, name: p.display_name as string }))}
        openCountByProperty={Object.fromEntries(openCountByProperty)}
        activeFilter={activeFilter}
      />
    </div>
  );
}
