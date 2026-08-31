import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// getStripe() reads env and constructs a real client, so it is mocked. The
// BillingNotConfiguredError class is re-exported unchanged because
// syncBillableQuantity uses `instanceof` on it.
const { getStripeMock, BillingNotConfiguredError } = vi.hoisted(() => {
  class BillingNotConfiguredError extends Error {}
  return { getStripeMock: vi.fn(), BillingNotConfiguredError };
});

vi.mock('@/lib/billing/stripe', () => ({
  getStripe: getStripeMock,
  BillingNotConfiguredError,
}));

const { countBillableProperties, syncBillableQuantity } = await import('./quantity-sync');

type Client = SupabaseClient<Database>;

/**
 * Minimal Supabase test double covering the two chains this module builds:
 * a head/count query on `properties`, and a maybeSingle read on `subscriptions`.
 * Purpose-built rather than a generic mock so a change in query shape fails loudly.
 */
function db(opts: {
  propertyCount?: number;
  propertyError?: { message: string } | null;
  subscription?: { stripe_subscription_id: string | null; quantity: number | null } | null;
  subscriptionError?: { message: string } | null;
}): Client {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const client = {
    calls,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      calls.push({ table, filters });
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[`eq:${col}`] = val;
          return chain;
        },
        is: (col: string, val: unknown) => {
          filters[`is:${col}`] = val;
          return chain;
        },
        neq: (col: string, val: unknown) => {
          filters[`neq:${col}`] = val;
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: opts.subscription ?? null,
            error: opts.subscriptionError ?? null,
          }),
        // `properties` is a head:true count query, so it is awaited directly.
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            count: opts.propertyCount ?? 0,
            error: opts.propertyError ?? null,
          }),
      };
      return chain;
    },
  };
  return client as unknown as Client;
}

function stripeDouble(over: {
  status?: string;
  itemId?: string | null;
  itemQuantity?: number;
  retrieveRejects?: Error;
} = {}) {
  const update = vi.fn(() => Promise.resolve({}));
  const retrieve = vi.fn(() =>
    over.retrieveRejects
      ? Promise.reject(over.retrieveRejects)
      : Promise.resolve({
          status: over.status ?? 'active',
          items: {
            data:
              over.itemId === null
                ? []
                : [{ id: over.itemId ?? 'si_1', quantity: over.itemQuantity ?? 1 }],
          },
        }),
  );
  return { subscriptions: { retrieve, update }, retrieve, update };
}

beforeEach(() => {
  getStripeMock.mockReset();
});

describe('countBillableProperties', () => {
  it('returns the live property count', async () => {
    await expect(countBillableProperties(db({ propertyCount: 7 }), 'acct-1')).resolves.toBe(7);
  });

  it('floors at 1 so Stripe never receives a zero quantity', async () => {
    // A host can reach checkout before creating their first property.
    await expect(countBillableProperties(db({ propertyCount: 0 }), 'acct-1')).resolves.toBe(1);
  });

  it('floors a null count at 1 rather than producing NaN', async () => {
    const client = db({});
    (client as unknown as { from: unknown }).from = () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            neq: () => ({ then: (r: (v: unknown) => unknown) => r({ count: null, error: null }) }),
          }),
        }),
      }),
    });
    await expect(countBillableProperties(client, 'acct-1')).resolves.toBe(1);
  });

  it('excludes soft-deleted and archived properties', async () => {
    const client = db({ propertyCount: 3 });
    await countBillableProperties(client, 'acct-9');
    const call = (client as unknown as { calls: { table: string; filters: Record<string, unknown> }[] })
      .calls[0];
    expect(call.table).toBe('properties');
    expect(call.filters).toMatchObject({
      'eq:host_account_id': 'acct-9',
      'is:deleted_at': null,
      'neq:status': 'archived',
    });
  });

  it('throws on a read error so callers cannot bill against a wrong count', async () => {
    await expect(
      countBillableProperties(db({ propertyError: { message: 'boom' } }), 'acct-1'),
    ).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('syncBillableQuantity', () => {
  it('updates Stripe with no proration when the count has changed', async () => {
    const stripe = stripeDouble({ itemQuantity: 1 });
    getStripeMock.mockReturnValue(stripe);

    await syncBillableQuantity(
      db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
      'acct-1',
    );

    expect(stripe.update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', quantity: 4 }],
      // Non-negotiable: a host must never be charged mid-cycle for adding a property.
      proration_behavior: 'none',
    });
  });

  it('does nothing for an account with no subscription', async () => {
    getStripeMock.mockReturnValue(stripeDouble());
    await syncBillableQuantity(db({ propertyCount: 4, subscription: null }), 'acct-1');
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it('does nothing when the subscription row has no Stripe id', async () => {
    getStripeMock.mockReturnValue(stripeDouble());
    await syncBillableQuantity(
      db({ propertyCount: 4, subscription: { stripe_subscription_id: null, quantity: 1 } }),
      'acct-1',
    );
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it('does not call Stripe when the stored quantity already matches', async () => {
    getStripeMock.mockReturnValue(stripeDouble());
    await syncBillableQuantity(
      db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 4 } }),
      'acct-1',
    );
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it('does not update a canceled subscription', async () => {
    const stripe = stripeDouble({ status: 'canceled' });
    getStripeMock.mockReturnValue(stripe);
    await syncBillableQuantity(
      db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
      'acct-1',
    );
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('does not update an expired incomplete subscription', async () => {
    const stripe = stripeDouble({ status: 'incomplete_expired' });
    getStripeMock.mockReturnValue(stripe);
    await syncBillableQuantity(
      db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
      'acct-1',
    );
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('skips the update when Stripe already holds the target quantity', async () => {
    // The DB row can lag the webhook; Stripe is the authority on current quantity.
    const stripe = stripeDouble({ itemQuantity: 4 });
    getStripeMock.mockReturnValue(stripe);
    await syncBillableQuantity(
      db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
      'acct-1',
    );
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('does not throw when the subscription has no items', async () => {
    const stripe = stripeDouble({ itemId: null });
    getStripeMock.mockReturnValue(stripe);
    await expect(
      syncBillableQuantity(
        db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
        'acct-1',
      ),
    ).resolves.toBeUndefined();
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('swallows a subscription read error', async () => {
    getStripeMock.mockReturnValue(stripeDouble());
    await expect(
      syncBillableQuantity(db({ subscriptionError: { message: 'db down' } }), 'acct-1'),
    ).resolves.toBeUndefined();
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it('swallows a Stripe failure so the property operation still succeeds', async () => {
    const stripe = stripeDouble({ retrieveRejects: new Error('stripe 500') });
    getStripeMock.mockReturnValue(stripe);
    await expect(
      syncBillableQuantity(
        db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
        'acct-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('swallows BillingNotConfiguredError on an environment with no Stripe keys', async () => {
    getStripeMock.mockImplementation(() => {
      throw new BillingNotConfiguredError('no keys');
    });
    await expect(
      syncBillableQuantity(
        db({ propertyCount: 4, subscription: { stripe_subscription_id: 'sub_1', quantity: 1 } }),
        'acct-1',
      ),
    ).resolves.toBeUndefined();
  });
});
