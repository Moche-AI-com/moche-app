import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getStripe, priceIdFor, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { publicEnv, serverEnv } from '@/lib/env';
import { ACTIVATION_FEE_ENABLED } from '@/lib/constants';
import { recordAcceptances } from '@/lib/legal/acceptance';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  planId: z.enum(['starter', 'pro', 'portfolio']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
  // Clickwrap: the checkout UI presents an unchecked-by-default agreement box.
  // Required true so a paid subscription is never created without recorded consent.
  acceptTerms: z.literal(true),
});

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  // Account-level billing: only the account owner may manage billing (co-hosts cannot).
  const canManageBilling = ctx.account.owner_id === ctx.user.id;
  if (!canManageBilling) {
    return NextResponse.json({ error: 'You cannot manage billing for this account.' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { planId, interval } = parsed.data;

  let stripe;
  try {
    stripe = getStripe();
  } catch (e) {
    if (e instanceof BillingNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }

  const price = priceIdFor(planId, interval);
  if (!price) {
    return NextResponse.json({ error: 'That plan is not available right now.' }, { status: 503 });
  }

  const supabase = createClient();
  const hostAccountId = ctx.account.id;

  // Record the checkout clickwrap consent against the authenticated user (RLS lets a
  // user insert their own acceptance rows). Best-effort — never blocks checkout.
  const h = headers();
  await recordAcceptances(supabase, {
    userId: ctx.user.id,
    hostAccountId,
    context: 'checkout',
    // Record exactly the agreements shown at checkout (paid subscription adds the DPA).
    slugs: ['terms', 'privacy', 'acceptable-use', 'dpa'],
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });

  try {
    // Ensure a Stripe customer exists for this account, reusing any stored id so we
    // never create duplicate customers across repeated checkouts.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('host_account_id', hostAccountId)
      .maybeSingle();

    // First-time checkout = no prior Stripe subscription on this account. The one-time
    // activation fee (when enabled + configured) is only added on the first checkout so
    // upgrades/downgrades never re-charge it.
    const isFirstCheckout = !existing?.stripe_subscription_id;

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.user.email ?? undefined,
        name: ctx.account.name ?? undefined,
        metadata: { host_account_id: hostAccountId },
      });
      customerId = customer.id;

      // Persist the customer id, idempotent on the unique host_account_id. Best-effort:
      // if RLS blocks the write, the webhook will persist it on checkout completion.
      const { error: upsertError } = await supabase
        .from('subscriptions')
        .upsert(
          { host_account_id: hostAccountId, stripe_customer_id: customerId },
          { onConflict: 'host_account_id' },
        );
      if (upsertError) {
        log.warn('stripe_checkout_customer_persist_failed', { error: upsertError.message });
      }
    }

    // Optional one-time onboarding fee, billed on the first invoice alongside the
    // subscription. add_invoice_items charges it once (not every renewal).
    const addActivationFee =
      ACTIVATION_FEE_ENABLED && isFirstCheckout && !!serverEnv.stripeActivationPriceId;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: hostAccountId,
      subscription_data: {
        metadata: { host_account_id: hostAccountId, plan: planId },
        ...(addActivationFee
          ? { add_invoice_items: [{ price: serverEnv.stripeActivationPriceId }] }
          : {}),
      },
      metadata: { host_account_id: hostAccountId, plan: planId },
      success_url: `${publicEnv.appUrl}/dashboard/billing?status=success`,
      cancel_url: `${publicEnv.appUrl}/dashboard/billing?status=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
    }

    await audit(supabase, {
      action: 'billing.checkout.started',
      actorProfileId: ctx.user.id,
      hostAccountId,
      targetType: 'subscription',
      metadata: { plan: planId, interval },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    log.error('stripe_checkout_failed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
