import { describe, it, expect, vi, beforeEach } from 'vitest';

// setSecretValue is mocked so no test ever holds a plaintext secret near a real
// client, and so the assertion that secrets bypass brain_values_set can be made
// directly rather than inferred.
const setSecretValue = vi.hoisted(() => vi.fn());
vi.mock('./values', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./values')>();
  return { ...actual, setSecretValue };
});

import { setHostValue, setHostValues } from './host-value';

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function fakeAdmin(opts?: { fail?: boolean }) {
  const calls: RpcCall[] = [];
  const admin = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (opts?.fail) return { data: null, error: { code: '42501', message: 'denied' } };
      return { data: 'value-row-id', error: null };
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls };
}

const BASE = { propertyId: 'p1', actorProfileId: 'actor1' };

beforeEach(() => {
  setSecretValue.mockReset();
  setSecretValue.mockResolvedValue('secret-row-id');
});

describe('setHostValue — registry gating', () => {
  it('refuses a field the registry does not define, without touching the database', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'not_a_field', raw: 'x' });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty value rather than writing a blank row', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'checkin_time', raw: '   ' });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('rejects a value that fails registry type validation', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'checkin_time', raw: '4pm-ish' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });
});

describe('setHostValue — non-secret write', () => {
  it('writes through brain_values_set stamped host_verified at full confidence', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'checkin_time', raw: '16:00' });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('brain_values_set');
    expect(calls[0].args.p_field_id).toBe('checkin_time');
    expect(calls[0].args.p_value).toBe('16:00');
    // host_verified, not ai_extracted: the host typed this, and provenance is what
    // the Brain page shows the host later when they ask "where did this come from".
    expect(calls[0].args.p_source).toBe('host_verified');
    expect(calls[0].args.p_confidence).toBe(1);
    expect(calls[0].args.p_actor).toBe('actor1');
    expect(calls[0].args.p_property_id).toBe('p1');
  });

  it('normalizes before writing, so the stored value matches the registry type', async () => {
    const { admin, calls } = fakeAdmin();
    await setHostValue(admin, { ...BASE, fieldId: 'checkin_time', raw: '  16:00  ' });
    expect(calls[0].args.p_value).toBe('16:00');
  });

  it('reports a database failure as a retryable message, not a raw error', async () => {
    const { admin } = fakeAdmin({ fail: true });
    const r = await setHostValue(admin, { ...BASE, fieldId: 'checkin_time', raw: '16:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toContain('42501');
      expect(r.error).not.toContain('denied');
    }
  });
});

describe('setHostValue — secrets', () => {
  it('routes a secret field to the vault and never through brain_values_set', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'wifi_password', raw: 'correct-horse' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.secret).toBe(true);
    expect(setSecretValue).toHaveBeenCalledTimes(1);
    // The plaintext must not have gone anywhere else.
    expect(calls).toHaveLength(0);
  });

  it('routes the door code to the vault too', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'door_code_or_entry_method', raw: '4821' });
    expect(r.ok).toBe(true);
    expect(setSecretValue).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('never echoes the plaintext back in the result', async () => {
    const { admin } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'wifi_password', raw: 'correct-horse' });
    expect(JSON.stringify(r)).not.toContain('correct-horse');
  });

  it('never echoes the plaintext back in a failure message either', async () => {
    setSecretValue.mockRejectedValue(new Error('vault refused value correct-horse'));
    const { admin } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'wifi_password', raw: 'correct-horse' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('correct-horse');
  });

  it('rejects an absurdly long secret before calling the vault', async () => {
    const { admin } = fakeAdmin();
    const r = await setHostValue(admin, { ...BASE, fieldId: 'wifi_password', raw: 'x'.repeat(500) });
    expect(r.ok).toBe(false);
    expect(setSecretValue).not.toHaveBeenCalled();
  });
});

describe('setHostValues — one wizard step', () => {
  it('saves every valid value and reports per-field errors for the rest', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValues(admin, {
      ...BASE,
      values: [
        { fieldId: 'checkin_time', raw: '16:00' },
        { fieldId: 'checkout_time', raw: 'whenever' },
        { fieldId: 'trash_schedule', raw: 'Bins go out on Tuesday nights.' },
      ],
    });
    // One bad time must not cost the host the two good answers.
    expect(r.saved).toEqual(['checkin_time', 'trash_schedule']);
    expect(Object.keys(r.errors)).toEqual(['checkout_time']);
    expect(calls).toHaveLength(2);
  });

  it('treats a skipped question as skipped, not as an error', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValues(admin, {
      ...BASE,
      values: [
        { fieldId: 'checkin_time', raw: '16:00' },
        { fieldId: 'late_checkout_policy', raw: '' },
      ],
    });
    expect(r.saved).toEqual(['checkin_time']);
    expect(r.errors).toEqual({});
    expect(calls).toHaveLength(1);
  });

  it('writes in the order given, so a re-submitted field supersedes in typing order', async () => {
    const { admin, calls } = fakeAdmin();
    await setHostValues(admin, {
      ...BASE,
      values: [
        { fieldId: 'checkin_time', raw: '15:00' },
        { fieldId: 'checkin_time', raw: '16:00' },
      ],
    });
    expect(calls.map((c) => c.args.p_value)).toEqual(['15:00', '16:00']);
  });

  it('returns an empty result for an empty step without calling the database', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await setHostValues(admin, { ...BASE, values: [] });
    expect(r.saved).toEqual([]);
    expect(r.errors).toEqual({});
    expect(calls).toHaveLength(0);
  });
});
