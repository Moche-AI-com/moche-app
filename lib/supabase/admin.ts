import 'server-only';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { publicEnv, serverEnv, hasServiceRole } from '@/lib/env';

// Service-role client. BYPASSES RLS. Server-only.
// Used exclusively for guest-side flows (verification, sessions, guest message/chunk writes)
// and trusted server workflows (webhooks, ingestion). NEVER import from client code.
//
// Guests are not Supabase auth users, so their reads/writes cannot go through RLS as a user;
// every such path must scope by property_id / stay_id explicitly in the query.

let cached: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (!hasServiceRole()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Guest/service flows require the service-role key. ' +
        'Set it in the environment (never expose to the browser).',
    );
  }
  if (cached) return cached;
  cached = createSupabaseClient<Database>(publicEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export { hasServiceRole };
