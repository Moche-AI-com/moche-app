import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getStripe, priceIdFor, BillingNotConfiguredError } from '@/lib/billing/stripe';
import { publicEnv } from '@/lib/env';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  planId: z.enum(['starter', 'growth', 'portfolio']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
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

  try {
    // Ensure a Stripe customer exists for this account, reusing any stored id so we
    // never create duplicate customers across repeated checkouts.
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('host_account_id', hostAccountId)
      .maybeSingle();

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: hostAccountId,
      subscription_data: { metadata: { host_account_id: hostAccountId, plan: planId } },
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
