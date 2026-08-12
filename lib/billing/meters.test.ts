import { describe, it, expect, vi, beforeEach } from 'vitest';

const { env, stripeMock } = vi.hoisted(() => ({
  env: { stripeMetersEnabled: false, stripeSecretKey: '' },
  stripeMock: {
    billing: {
      meterEvents: { create: vi.fn() },
      meters: { list: vi.fn(), create: vi.fn() },
    },
  },
}));

vi.mock('@/lib/env', () => ({ serverEnv: env, publicEnv: {} }));
vi.mock('./stripe', () => ({
  getStripe: () => stripeMock,
  isBillingConfigured: () => env.stripeSecretKey.length > 0,
}));

import { METERS, meteringEnabled, meterEventIdentifier, recordMeterEvent, ensureMeters } from './meters';

beforeEach(() => {
  env.stripeMetersEnabled = false;
  env.stripeSecretKey = '';
  stripeMock.billing.meterEvents.create.mockReset();
  stripeMock.billing.meters.list.mockReset();
  stripeMock.billing.meters.create.mockReset();
});

describe('metering flag', () => {
  it('is off unless the flag and a Stripe key both exist', () => {
    expect(meteringEnabled()).toBe(false);
    env.stripeMetersEnabled = true;
    expect(meteringEnabled()).toBe(false);
    env.stripeSecretKey = 'rk_test_x';
    expect(meteringEnabled()).toBe(true);
  });

  it('records nothing while disabled', async () => {
    env.stripeSecretKey = 'rk_test_x';
    await expect(
      recordMeterEvent({
        key: 'guest_conversation',
        stripeCustomerId: 'cus_1',
        subjectId: 'conv-1',
        occurredAt: '2026-06-01T12:00:00.000Z',
      }),
    ).resolves.toEqual({ recorded: false, reason: 'disabled' });
    expect(stripeMock.billing.meterEvents.create).not.toHaveBeenCalled();
  });
});

describe('recordMeterEvent', () => {
  beforeEach(() => {
    env.stripeMetersEnabled = true;
    env.stripeSecretKey = 'rk_test_x';
  });

  it('sends the documented payload shape with a unix timestamp', async () => {
    stripeMock.billing.meterEvents.create.mockResolvedValue({});
    const out = await recordMeterEvent({
      key: 'guest_conversation',
      stripeCustomerId: 'cus_1',
      subjectId: 'conv-1',
      occurredAt: '2026-06-01T12:00:00.000Z',
    });
    expect(out).toEqual({ recorded: true, identifier: 'moche_guest_conversation:conv-1:2026-06-01T12:00:00.000Z' });
    expect(stripeMock.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'moche_guest_conversation',
      identifier: 'moche_guest_conversation:conv-1:2026-06-01T12:00:00.000Z',
      timestamp: 1780315200,
      payload: { stripe_customer_id: 'cus_1', value: '1' },
    });
  });

  it('derives the same identifier for a retry of the same usage', () => {
    const a = meterEventIdentifier('ai_answer', 'conv-9', '2026-06-01T12:00:00.000Z');
    const b = meterEventIdentifier('ai_answer', 'conv-9', '2026-06-01T12:00:00.000Z');
    expect(a).toBe(b);
    expect(meterEventIdentifier('ai_answer', 'conv-10', '2026-06-01T12:00:00.000Z')).not.toBe(a);
  });

  it('refuses without a customer rather than sending an unattributable event', async () => {
    await expect(
      recordMeterEvent({
        key: 'ai_answer',
        stripeCustomerId: '',
        subjectId: 'conv-1',
        occurredAt: '2026-06-01T12:00:00.000Z',
      }),
    ).resolves.toMatchObject({ recorded: false, reason: 'not_configured', detail: 'no_customer' });
    expect(stripeMock.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it('never throws when Stripe rejects the event', async () => {
    stripeMock.billing.meterEvents.create.mockRejectedValue(new Error('rate limited'));
    await expect(
      recordMeterEvent({
        key: 'ai_answer',
        stripeCustomerId: 'cus_1',
        subjectId: 'conv-1',
        occurredAt: '2026-06-01T12:00:00.000Z',
      }),
    ).resolves.toMatchObject({ recorded: false, reason: 'failed', detail: 'rate limited' });
  });
});

describe('ensureMeters', () => {
  it('creates only the missing meters', async () => {
    stripeMock.billing.meters.list.mockResolvedValue({ data: [{ event_name: 'moche_guest_conversation' }] });
    stripeMock.billing.meters.create.mockResolvedValue({});
    const out = await ensureMeters();
    expect(out.existing).toEqual(['moche_guest_conversation']);
    expect(out.created).toEqual(['moche_ai_answer', 'moche_property_import']);
    expect(stripeMock.billing.meters.create).toHaveBeenCalledTimes(2);
    expect(stripeMock.billing.meters.create.mock.calls[0][0]).toMatchObject({
      event_name: 'moche_ai_answer',
      default_aggregation: { formula: 'sum' },
      value_settings: { event_payload_key: 'value' },
      customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
    });
  });

  it('is a no-op when every meter already exists', async () => {
    stripeMock.billing.meters.list.mockResolvedValue({
      data: Object.values(METERS).map((m) => ({ event_name: m.event_name })),
    });
    const out = await ensureMeters();
    expect(out.created).toEqual([]);
    expect(stripeMock.billing.meters.create).not.toHaveBeenCalled();
  });

  it('keeps event names namespaced so they cannot collide with another product', () => {
    for (const m of Object.values(METERS)) expect(m.event_name.startsWith('moche_')).toBe(true);
  });
});
