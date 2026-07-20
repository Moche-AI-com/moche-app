import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, planFromPriceId, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { serverEnv, hasServiceRole } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';
import type { Database } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubStatus = Database['public']['Enums']['subscription_status'];
type SubscriptionUpdate = Database['public']['Tables']['subscriptions']['Update'];

const VALID_STATUSES: SubStatus[] = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
];

// Stripe subscription.status aligns 1:1 with our enum; guard any unexpected value.
function mapStatus(status: string): SubStatus {
  return (VALID_STATUSES as string[]).includes(status) ? (status as SubStatus) : 'incomplete';
}

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.id;
}

// Derives the subscriptions-row fields from a Stripe Subscription object.
function fieldsFromSubscription(sub: Stripe.Subscription, statusOverride?: SubStatus): SubscriptionUpdate {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  return {
    status: statusOverride ?? mapStatus(sub.status),
    plan: planFromPriceId(priceId),
    stripe_customer_id: idOf(sub.customer),
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    quantity: item?.quantity ?? 1,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  // Config guard — clean response instead of a 500/throw.
  if (!serverEnv.stripeSecretKey || !serverEnv.stripeWebhookSecret) {
    log.warn('stripe_webhook_not_configured', {});
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  // Signature verification requires the RAW request body — never JSON.parse first.
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, serverEnv.stripeWebhookSecret);
  } catch (e) {
    log.warn('stripe_webhook_bad_signature', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // A webhook has no user session, so it must use the service-role client. If the key
  // is absent we cannot persist — return 500 so Stripe retries once it is configured.
  if (!hasServiceRole()) {
    log.error('stripe_webhook_no_service_role', { type: event.type });
    return NextResponse.json({ error: 'Service unavailable.' }, { status: 500 });
  }
  const admin = createAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const hostAccountId =
          session.client_reference_id ?? session.metadata?.host_account_id ?? null;
        const subId = idOf(session.subscription);
        if (!hostAccountId || !subId) {
          log.warn('stripe_webhook_checkout_missing_refs', { hasAccount: !!hostAccountId, hasSub: !!subId });
          break;
        }
        const subscription = await stripe.subscriptions.retrieve(subId);
        const fields = fieldsFromSubscription(subscription);
        // Idempotent: unique host_account_id means repeated events update the same row.
        const { error } = await admin
          .from('subscriptions')
          .upsert({ host_account_id: hostAccountId, ...fields }, { onConflict: 'host_account_id' });
        if (error) {
          log.error('stripe_webhook_upsert_failed', { type: event.type, error: error.message });
          return NextResponse.json({ error: 'Persist failed.' }, { status: 500 });
        }
        await notify(admin, {
          hostAccountId,
          kind: 'billing',
          title: 'Subscription active',
          body: fields.plan ? `Your ${fields.plan} plan is now active.` : 'Your subscription is now active.',
          link: '/dashboard/billing',
        });
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const deleted = event.type === 'customer.subscription.deleted';
        const fields = fieldsFromSubscription(sub, deleted ? 'canceled' : undefined);
        const hostAccountId = sub.metadata?.host_account_id ?? null;

        if (hostAccountId) {
          const { error } = await admin
            .from('subscriptions')
            .upsert({ host_account_id: hostAccountId, ...fields }, { onConflict: 'host_account_id' });
          if (error) {
            log.error('stripe_webhook_upsert_failed', { type: event.type, error: error.message });
            return NextResponse.json({ error: 'Persist failed.' }, { status: 500 });
          }
        } else {
          // No metadata (e.g. subscription created outside our flow) — match the existing row.
          const { error } = await admin
            .from('subscriptions')
            .update(fields)
            .eq('stripe_subscription_id', sub.id);
          if (error) {
            log.error('stripe_webhook_update_failed', { type: event.type, error: error.message });
            return NextResponse.json({ error: 'Persist failed.' }, { status: 500 });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = idOf(invoice.subscription);
        const customerId = idOf(invoice.customer);

        // Resolve the row to get host_account_id for the notification.
        let query = admin.from('subscriptions').select('host_account_id');
        if (subId) query = query.eq('stripe_subscription_id', subId);
        else if (customerId) query = query.eq('stripe_customer_id', customerId);
        else break;
        const { data: row } = await query.maybeSingle();

        const update = admin
          .from('subscriptions')
          .update({ status: 'past_due' as SubStatus, updated_at: new Date().toISOString() });
        const { error } = subId
          ? await update.eq('stripe_subscription_id', subId)
          : await update.eq('stripe_customer_id', customerId!);
        if (error) {
          log.error('stripe_webhook_update_failed', { type: event.type, error: error.message });
          return NextResponse.json({ error: 'Persist failed.' }, { status: 500 });
        }
        if (row?.host_account_id) {
          await notify(admin, {
            hostAccountId: row.host_account_id,
            kind: 'billing',
            title: 'Payment failed',
            body: 'We could not process your latest payment. Please update your billing details.',
            link: '/dashboard/billing',
          });
        }
        break;
      }

      default:
        // Unknown / unhandled events are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (e) {
    log.error('stripe_webhook_handler_error', { type: event.type, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
