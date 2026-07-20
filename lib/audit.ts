import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

interface AuditParams {
  action: string;
  actorType?: string;
  actorProfileId?: string | null;
  hostAccountId?: string | null;
  propertyId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipHash?: string | null;
  metadata?: Json;
}

// Best-effort audit logging of sensitive actions. Never throws into the caller path.
// audit_logs is append-only with no host-side INSERT RLS policy, so writes go through
// the service-role client. The passed-in client is accepted for backwards compatibility
// but the trusted admin client is preferred when the service-role key is available.
export async function audit(client: Client, p: AuditParams): Promise<void> {
  try {
    const writer = hasServiceRole() ? createAdminClient() : client;
    await writer.from('audit_logs').insert({
      action: p.action,
      actor_type: p.actorType ?? 'host',
      actor_profile_id: p.actorProfileId ?? null,
      host_account_id: p.hostAccountId ?? null,
      property_id: p.propertyId ?? null,
      target_type: p.targetType ?? null,
      target_id: p.targetId ?? null,
      ip_hash: p.ipHash ?? null,
      metadata: p.metadata ?? null,
    });
  } catch (e) {
    log.warn('audit_log_failed', { action: p.action, error: String(e) });
  }
}
