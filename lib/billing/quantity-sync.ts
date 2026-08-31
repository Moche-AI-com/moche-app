import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getStripe, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

/**
 * Counts the properties an account is billed for.
 *
 * The Host plan is priced per property per month, so the Stripe line-item
 * quantity IS this number. Archived and soft-deleted properties are excluded:
 * they are invisible in the dashboard, so charging for them would be indefensible.
 * Drafts and paused properties ARE counted, because both still occupy a slot the
 * host can publish at any moment without telling us.
 *
 * Exported for the checkout route, so the quantity written at signup and the
 * quantity synced afterwards can never drift apart through duplicated queries.
 */
export async function countBillableProperties(
  db: Client,
  hostAccountId: string,
): Promise<number> {
  const { count, error } = await db
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('host_account_id', hostAccountId)
    .is('deleted_at', null)
    .neq('status', 'archived');
  if (error) throw error;
  // Floor of 1: a brand-new host can start a plan before creating a property,
  // and Stripe rejects a zero quantity on a subscription item.
  return Math.max(1, count ?? 0);
}

/**
 * Brings the account's Stripe subscription quantity in line with its property
 * count, after a property is created, archived, restored, or deleted.
 *
 * ## Billing behaviour
 *
 * `proration_behavior: 'none'` is deliberate. The quantity changes in Stripe
 * immediately, so the NEXT invoice is correct, but no mid-cycle charge or credit
 * is raised. A host who adds a property therefore carries it free until their
 * renewal, and a host who archives one keeps paying until renewal. We accept
 * that small asymmetry to avoid the alternative: a surprise prorated charge
 * seconds after someone clicks "Add property", which reads as a bait and switch
 * and is the most common billing complaint in this category.
 *
 * ## Failure behaviour
 *
 * Never throws. A property operation must not fail because Stripe is
 * unreachable, misconfigured, or the account has no subscription yet. Every exit
 * is logged with a reason so a drift between property count and billed quantity
 * is diagnosable from logs alone.
 *
 * Safe to call for free accounts and pre-launch accounts: both simply have no
 * `stripe_subscription_id` and return early.
 */
export async function syncBillableQuantity(
  db: Client,
  hostAccountId: string,
): Promise<void> {
  try {
    const { data: sub, error } = await db
      .from('subscriptions')
      .select('stripe_subscription_id, quantity')
      .eq('host_account_id', hostAccountId)
      .maybeSingle();

    if (error) {
      log.warn('quantity_sync_subscription_read_failed', { error: error.message });
      return;
    }
    // No subscription: free plan, pre-launch account, or checkout never completed.
    if (!sub?.stripe_subscription_id) return;

    const quantity = await countBillableProperties(db, hostAccountId);
    if (sub.quantity === quantity) return;

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

    // Guard against acting on a subscription Stripe no longer bills. Updating a
    // canceled subscription errors, and updating one in an incomplete state can
    // trigger an unwanted payment attempt.
    if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
      return;
    }

    const item = subscription.items.data[0];
    if (!item) {
      log.warn('quantity_sync_no_subscription_item', {
        subscriptionId: sub.stripe_subscription_id,
      });
      return;
    }
    if (item.quantity === quantity) return;

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: item.id, quantity }],
      proration_behavior: 'none',
    });

    // The row is not written here on purpose. Stripe emits
    // customer.subscription.updated, and the webhook is the single writer of
    // billing fields on the subscriptions row. Writing here as well would race
    // it and could persist a quantity Stripe later rejected.
    log.info('quantity_sync_updated', {
      subscriptionId: sub.stripe_subscription_id,
      from: item.quantity ?? null,
      to: quantity,
    });
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) return;
    log.warn('quantity_sync_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
