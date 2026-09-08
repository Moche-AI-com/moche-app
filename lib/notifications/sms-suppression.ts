import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { hashContact } from '@/lib/crypto';

/** A provider STOP is destination-wide. Registration on a new browser cannot
 * erase it. An unavailable suppression store fails CLOSED for all SMS. */
export async function isSmsSuppressed(client: SupabaseClient<Database>, phone: string): Promise<boolean> {
  try {
    const { data, error } = await (client as any).from('sms_suppressions')
      .select('phone_hash').eq('phone_hash', hashContact(phone).contactHash).maybeSingle();
    return !!error || !!data;
  } catch { return true; }
}
