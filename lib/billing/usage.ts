import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getEntitlements } from '@/lib/billing/entitlements';

type Client = SupabaseClient<Database>;

export interface ConversationUsage {
  // Pooled guest conversations started in the current period across every property
  // on the account. One counter per host account, never per property.
  used: number;
  // 0 means "no allowance to measure against": no plan, or a sales-assisted tier
  // whose allowance is set by contract. Callers must treat 0 as "do not throttle".
  allowance: number;
  // used/allowance as a percentage, rounded to a whole number. null when allowance
  // is 0, so a missing allowance can never be mistaken for 0% used.
  percentUsed: number | null;
  periodStart: string;
  periodEnd: string | null;
}

// Start of the current billing period. Stripe's current_period_end is the only
// authoritative period boundary we store, so the window is derived backwards from
// it. With no subscription we fall back to a calendar month, which is what an
// account with no plan is implicitly on.
export function periodWindow(currentPeriodEnd: string | null): { start: Date; end: Date | null } {
  if (!currentPeriodEnd) {
    const now = new Date();
    return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: null };
  }
  const end = new Date(currentPeriodEnd);
  const start = new Date(end);
  // Monthly and annual plans both bill in whole months, and Stripe keeps
  // current_period_end one interval ahead. Subtracting a month gives the start of
  // the current usage window for monthly plans; annual plans are metered monthly
  // against the same pooled allowance, so a monthly window is correct for both.
  start.setUTCMonth(start.getUTCMonth() - 1);
  return { start, end };
}

// Pooled conversation usage for one host account in the current period.
//
// Reads through the account_conversation_usage RPC rather than counting in the app:
// the count spans `conversations` and `properties`, which no single member's RLS
// predicates cover, and the RPC re-checks account membership itself.
export async function getConversationUsage(
  client: Client,
  hostAccountId: string,
): Promise<ConversationUsage> {
  const ent = await getEntitlements(client, hostAccountId);
  const { start, end } = periodWindow(ent.currentPeriodEnd);

  const { data, error } = await client.rpc('account_conversation_usage', {
    p_host_account_id: hostAccountId,
    p_since: start.toISOString(),
  });

  // A failed count must not be reported as zero usage — that would silently disable
  // every throttle threshold. Report -1 so callers can tell "unknown" from "none".
  const used = error ? -1 : Number(data ?? 0);

  return {
    used,
    allowance: ent.conversationAllowance,
    percentUsed:
      ent.conversationAllowance > 0 && used >= 0
        ? Math.round((used / ent.conversationAllowance) * 100)
        : null,
    periodStart: start.toISOString(),
    periodEnd: end ? end.toISOString() : null,
  };
}
