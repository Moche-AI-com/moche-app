import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELD_ID = 'door_code_or_entry_method';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

// Host-only reveal of the door/access code the host chose to keep in Moche-AI.
// The code never reaches a guest surface or a model: the registry tier is
// host_only, guest entry-code questions escalate to the host, and the database
// function behind this route refuses every caller except service_role and every
// field that is not a host_only Vault secret.
//
// POST (not GET) so the code is never cached, prefetched, or replayed from
// browser history. The audit row is written BEFORE the read and the route fails
// closed if it cannot be written: no unlogged reveals.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.editBrain) {
    return NextResponse.json(
      { error: 'Only the owner or a Brain editor can view the door code.' },
      { status: 403, headers: NO_STORE },
    );
  }
  const user = await getUser();
  const db = createAdminClient() as any;

  const { error: auditError } = await db.from('audit_logs').insert({
    host_account_id: access.property.host_account_id,
    property_id: id,
    actor_profile_id: user?.id ?? null,
    actor_type: 'host',
    action: 'brain.door_code_revealed',
    target_type: 'brain_value',
    target_id: FIELD_ID,
    metadata: { via: 'dashboard' },
  });
  if (auditError) {
    return NextResponse.json({ error: 'Could not load the door code.' }, { status: 503, headers: NO_STORE });
  }

  const { data, error } = await db.rpc('brain_values_read_host_secret', { p_property_id: id, p_field_id: FIELD_ID });
  if (error) {
    return NextResponse.json({ error: 'Could not load the door code.' }, { status: 503, headers: NO_STORE });
  }
  const code = typeof data === 'string' && data.length > 0 ? data : null;
  return NextResponse.json({ code }, { headers: NO_STORE });
}
