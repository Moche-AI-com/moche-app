import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { LifecycleToggle, parseLifecycleView, lifecycleStatusFor } from '@/components/dashboard/LifecycleToggle';
import { ExtrasOrdersClient, type ExtrasOrderRow } from './ExtrasOrdersClient';

export const dynamic = 'force-dynamic';

// Host-facing queue of guest Extras requests. Deliberately a sibling of
// /dashboard/service-requests rather than a tab inside it: an extras order is a
// revenue event with its own lifecycle, and folding it into the maintenance
// queue would bury paid requests underneath broken air conditioners.
export default async function ExtrasPage({ searchParams }: { searchParams?: { view?: string | string[] } }) {
  const view = parseLifecycleView(searchParams?.view);
  const ctx = await requireSession();
  const supabase = createClient();
  const isOwner = ctx.account.owner_id === ctx.user.id;

  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', ctx.account.id)
    .is('deleted_at', null);

  const propMap = new Map((properties ?? []).map((p) => [p.id, p.display_name]));
  const propIds = (properties ?? []).map((p) => p.id);

  let orders: ExtrasOrderRow[] = [];
  let activeCount = 0;
  let pastCount = 0;
  // Mirrors can_edit_property in the database: owner, or a member with brain
  // edit rights. Anything outside this set renders read-only rather than
  // showing buttons the API would reject.
  let manageable = new Set<string>(isOwner ? propIds : []);

  if (propIds.length) {
    const [{ data: rows }, activeRes, pastRes] = await Promise.all([
      supabase
        .from('extras_orders')
        .select(
          'id, property_id, stay_id, escalation_id, item_title, item_price_text, quantity, guest_note, host_note, status, created_at, archived_at',
        )
        .in('property_id', propIds)
        .eq('lifecycle_status', lifecycleStatusFor(view))
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('extras_orders')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('lifecycle_status', 'active'),
      supabase
        .from('extras_orders')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('lifecycle_status', 'archived'),
    ]);
    orders = (rows ?? []) as ExtrasOrderRow[];
    activeCount = activeRes.count ?? 0;
    pastCount = pastRes.count ?? 0;

    if (!isOwner) {
      const { data: members } = await supabase
        .from('property_members')
        .select('property_id, can_edit_brain')
        .in('property_id', propIds)
        .eq('profile_id', ctx.user.id);
      manageable = new Set((members ?? []).filter((m) => m.can_edit_brain).map((m) => m.property_id));
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '1.1rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 .3rem' }}>Extras</h1>
        <p className="muted" style={{ margin: 0, fontSize: '.92rem' }}>
          Requests your guests made from the Extras list in their guide. Confirm one to let your guest know it is on the
          way, then mark it fulfilled once it is done.
        </p>
      </div>

      <LifecycleToggle
        basePath="/dashboard/extras"
        view={view}
        activeCount={activeCount}
        pastCount={pastCount}
        pastLabel="Completed"
        ariaLabel="Filter extras requests"
      />

      <ExtrasOrdersClient
        orders={orders}
        propertyNames={Object.fromEntries(propMap)}
        manageableProperties={[...manageable]}
      />
    </div>
  );
}
