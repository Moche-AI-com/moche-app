import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { parseLifecycleView, lifecycleStatusFor } from '@/components/dashboard/LifecycleToggle';
import { resolveScope } from '@/lib/dashboard/scope';
import { ServiceRequestsClient, type ServiceTicket, type PropertyContactOption, type MemberOption } from './ServiceRequestsClient';

export const dynamic = 'force-dynamic';

export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams?: { view?: string | string[]; property?: string | string[] };
}) {
  const view = parseLifecycleView(searchParams?.view);
  const requestedProperty = typeof searchParams?.property === 'string' ? searchParams.property : null;
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
  // Property scope: the URL parameter can only ever narrow the already-authorized
  // property list, never widen it (same guard as the Home dashboard).
  const scopedPropertyId = resolveScope(requestedProperty, propIds);
  const queryPropIds = scopedPropertyId ? [scopedPropertyId] : propIds;

  let list: ServiceTicket[] = [];
  let contacts: PropertyContactOption[] = [];
  let members: MemberOption[] = [];
  let resolvableProperties = new Set<string>(isOwner ? propIds : []);
  let activeCount = 0;
  let pastCount = 0;

  if (queryPropIds.length) {
    const [{ data: tickets }, { data: contactRows }, activeRes, pastRes] = await Promise.all([
      // edited_* / assigned_profile_id land in database.types.ts on the next
      // `supabase gen types` run; until then this query opts out of column
      // typechecking. safety_flags is included so the Edit report dialog can
      // round-trip it without wiping the column on save.
      (supabase as any)
        .from('service_requests')
        .select(
          'id, property_id, description, service_type, status, urgency, resolution_notes, created_at, archived_at, location_note, likely_causes, suggested_parts, safety_flags, access_instructions, guest_availability, summary, media_urls, interview_status, assigned_contact_id, assigned_profile_id, edited_summary, edited_details',
        )
        .in('property_id', queryPropIds)
        .eq('lifecycle_status', lifecycleStatusFor(view))
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('property_contacts')
        .select('id, property_id, name, label, contact_type, phone, email, is_primary, is_emergency')
        .in('property_id', queryPropIds),
      // head:true fetches the count without transferring rows.
      supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .in('property_id', queryPropIds)
        .eq('lifecycle_status', 'active'),
      supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .in('property_id', queryPropIds)
        .eq('lifecycle_status', 'archived'),
    ]);
    list = (tickets ?? []) as ServiceTicket[];
    contacts = contactRows ?? [];
    activeCount = activeRes.count ?? 0;
    pastCount = pastRes.count ?? 0;

    if (!isOwner) {
      const { data: memberRows } = await supabase
        .from('property_members')
        .select('property_id, can_resolve_maintenance')
        .in('property_id', propIds)
        .eq('profile_id', ctx.user.id);
      resolvableProperties = new Set((memberRows ?? []).filter((m) => m.can_resolve_maintenance).map((m) => m.property_id));
    }

    // Assignable teammates: the account owner plus every property member.
    // Read through the service role because other users' names/emails are
    // account data the RLS session client does not expose; scoped strictly to
    // this account's properties. Without a service role the owner can still
    // assign to themselves.
    if (hasServiceRole()) {
      const admin = createAdminClient();
      const { data: membershipRows } = await admin
        .from('property_members')
        .select('property_id, profile_id')
        .in('property_id', queryPropIds);
      const profileIds = [...new Set([ctx.account.owner_id, ...(membershipRows ?? []).map((m) => m.profile_id)])];
      const { data: profiles } = profileIds.length
        ? await admin.from('profiles').select('id, email, full_name').in('id', profileIds)
        : { data: [] };
      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
      const seen = new Set<string>();
      const pushMember = (propertyId: string, profileId: string) => {
        const key = `${propertyId}:${profileId}`;
        if (seen.has(key)) return;
        const p = profileById.get(profileId);
        if (!p) return;
        seen.add(key);
        members.push({ id: p.id, property_id: propertyId, name: (p.full_name ?? '').trim() || null, email: p.email ?? null });
      };
      for (const pid of queryPropIds) pushMember(pid, ctx.account.owner_id);
      for (const m of membershipRows ?? []) pushMember(m.property_id, m.profile_id);
    } else if (isOwner) {
      members = queryPropIds.map((pid) => ({
        id: ctx.user.id,
        property_id: pid,
        name: (ctx.profile.full_name ?? '').trim() || null,
        email: ctx.profile.email ?? null,
      }));
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
      members={members}
      view={view}
      activeCount={activeCount}
      pastCount={pastCount}
      activePropertyId={scopedPropertyId}
    />
  );
}
