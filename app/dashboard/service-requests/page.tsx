import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { parseLifecycleView, lifecycleStatusFor } from '@/components/dashboard/LifecycleToggle';
import { ServiceRequestsClient, type ServiceTicket, type PropertyContactOption } from './ServiceRequestsClient';

export const dynamic = 'force-dynamic';

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams?: { view?: string | string[] };
}) {
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

  let list: ServiceTicket[] = [];
  let contacts: PropertyContactOption[] = [];
  let resolvableProperties = new Set<string>(isOwner ? propIds : []);
  let activeCount = 0;
  let pastCount = 0;

  if (propIds.length) {
    const [{ data: tickets }, { data: contactRows }, activeRes, pastRes] = await Promise.all([
      supabase
        .from('service_requests')
        .select(
          'id, property_id, description, service_type, status, urgency, resolution_notes, created_at, archived_at, location_note, likely_causes, suggested_parts, access_instructions, guest_availability, summary, media_urls, interview_status, assigned_contact_id',
        )
        .in('property_id', propIds)
        .eq('lifecycle_status', lifecycleStatusFor(view))
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('property_contacts')
        .select('id, property_id, name, label, contact_type, phone, email, is_primary, is_emergency')
        .in('property_id', propIds),
      // head:true fetches the count without transferring rows.
      supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('lifecycle_status', 'active'),
      supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('lifecycle_status', 'archived'),
    ]);
    list = tickets ?? [];
    contacts = contactRows ?? [];
    activeCount = activeRes.count ?? 0;
    pastCount = pastRes.count ?? 0;

    if (!isOwner) {
      const { data: members } = await supabase
        .from('property_members')
        .select('property_id, can_resolve_maintenance')
        .in('property_id', propIds)
        .eq('profile_id', ctx.user.id);
      resolvableProperties = new Set((members ?? []).filter((m) => m.can_resolve_maintenance).map((m) => m.property_id));
    }
  }

  const properties_ = (properties ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    canResolve: resolvableProperties.has(p.id),
  }));

  return (
    <ServiceRequestsClient
      tickets={list}
      propertyNames={Object.fromEntries(propMap)}
      properties={properties_}
      contacts={contacts}
      view={view}
      activeCount={activeCount}
      pastCount={pastCount}
    />
  );
}
