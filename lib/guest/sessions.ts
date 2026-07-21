import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface HostSessionView {
  id: string;
  userAgent: string | null;
  ipHint: string; // opaque, e.g. "••ab12" (last-4 of the ip hash), never the raw IP
  verifiedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  status: string;
  guestDisplayName: string | null;
}

function ipHint(ipHash: string | null): string {
  if (!ipHash) return '••----';
  return `••${ipHash.slice(-4)}`;
}

// Lists guest sessions for a property (service-role — sessions carry no host RLS).
// Newest first. Caller MUST have already authorized host access to the property.
export async function listPropertySessions(propertyId: string, activeOnly = true): Promise<HostSessionView[]> {
  const admin = createAdminClient();
  let query = admin
    .from('guest_access_sessions')
    .select('id, user_agent, ip_hash, verified_at, expires_at, revoked_at, status, stays(guest_display_name)')
    .eq('property_id', propertyId)
    .order('verified_at', { ascending: false })
    .limit(100);
  if (activeOnly) query = query.eq('status', 'verified').is('revoked_at', null);

  const { data } = await query;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    user_agent: string | null;
    ip_hash: string | null;
    verified_at: string | null;
    expires_at: string;
    revoked_at: string | null;
    status: string;
    stays: { guest_display_name: string | null } | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    ipHint: ipHint(r.ip_hash),
    verifiedAt: r.verified_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    status: r.status,
    guestDisplayName: r.stays?.guest_display_name ?? null,
  }));
}
