import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// serverEnv is read at module scope in lib/env.ts, so the mock has to replace the object
// rather than the process env. vi.mock is hoisted above const declarations, so the shared
// record lives on vi.hoisted rather than a top-level const.
const { env } = vi.hoisted(() => ({
  env: {
    cloudflareAccountId: '',
    cloudflareQueuesToken: '',
    cloudflareMiningQueueId: '',
    brainWriteWorkerEnabled: false,
    brainWriteWorkerUrl: '',
    brainWriteWorkerSecret: '',
  },
}));

vi.mock('@/lib/env', () => ({ serverEnv: env, publicEnv: {} }));

import { enqueueMining, miningQueueConfigured, miningDedupeKey, type MiningMessage } from './cloudflare';
import { dispatchBrainWrite, brainWriteWorkerConfigured, type BrainWriteJob } from './brain-write';
import { REGISTRY_FIELDS } from '@/lib/brain/completeness';

const PROPERTY_ID = 'ba52ae45-2126-4d50-871d-03f9722b9633';
const SOURCE_ID = '7c1f0e2a-9d3b-4a15-8f62-1b0c5d4e7a98';

const MSG: MiningMessage = {
  kind: 'conversation_correction',
  property_id: PROPERTY_ID,
  source_id: SOURCE_ID,
  occurred_at: '2026-06-01T12:00:00.000Z',
  field_id: 'checkout_time',
  signal: 'guest_contradicted_stored_value',
};

/** The wire adds the dedupe key we derive; the caller never supplies one. */
const WIRE = {
  ...MSG,
  dedupe_key: `conversation_correction:${PROPERTY_ID}:${SOURCE_ID}:checkout_time`,
};

const wireBody = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return init.body as string;
};

const JOB: BrainWriteJob = {
  property_id: 'ba52ae45-2126-4d50-871d-03f9722b9633',
  field_id: 'checkout_time',
  candidate_id: 'cand-1',
  supersedes_id: null,
  origin: 'guest_conversation',
  requested_at: '2026-06-01T12:00:00.000Z',
};

function configureQueue() {
  env.cloudflareAccountId = 'acct123';
  env.cloudflareQueuesToken = 'tok123';
  env.cloudflareMiningQueueId = 'queue123';
}

beforeEach(() => {
  env.cloudflareAccountId = '';
  env.cloudflareQueuesToken = '';
  env.cloudflareMiningQueueId = '';
  env.brainWriteWorkerEnabled = false;
  env.brainWriteWorkerUrl = '';
  env.brainWriteWorkerSecret = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mining queue configuration', () => {
  it('is unconfigured until account, token and queue id are all present', () => {
    expect(miningQueueConfigured()).toBe(false);
    env.cloudflareAccountId = 'acct123';
    env.cloudflareQueuesToken = 'tok123';
    expect(miningQueueConfigured()).toBe(false);
    env.cloudflareMiningQueueId = 'queue123';
    expect(miningQueueConfigured()).toBe(true);
  });

  it('does not attempt a request when unconfigured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(enqueueMining(MSG)).resolves.toEqual({ ok: false, queued: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('enqueueMining', () => {
  it('posts to the documented push endpoint with a json content type', async () => {
    configureQueue();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(enqueueMining(MSG)).resolves.toEqual({ ok: true, queued: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct123/queues/queue123/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    const sent = JSON.parse(init.body as string);
    expect(sent.content_type).toBe('json');
    expect(sent.body).toEqual(WIRE);
  });

  it('treats HTTP 200 with success:false as a rejection', async () => {
    configureQueue();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 1 }] }), { status: 200 })),
    );
    await expect(enqueueMining(MSG)).resolves.toMatchObject({ ok: false, reason: 'rejected', detail: 'success_false' });
  });

  it('reports a non-2xx as rejected with the status', async () => {
    configureQueue();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    await expect(enqueueMining(MSG)).resolves.toMatchObject({ ok: false, reason: 'rejected', detail: 'http_403' });
  });

  it('never throws when the transport fails', async () => {
    configureQueue();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    await expect(enqueueMining(MSG)).resolves.toMatchObject({ ok: false, reason: 'unreachable' });
  });

  // This replaces an earlier `too_large` test rather than weakening it: every wire member
  // is now a uuid, an enum, a registry id, or a value derived from those, so no input can
  // produce a body near the 128 KiB ceiling and the `too_large` branch is unreachable by
  // construction. The bound is asserted instead of the branch, because that is the property
  // that actually holds — and if a future field makes it reachable again, this fails first.
  it('cannot produce a body anywhere near the size ceiling', async () => {
    configureQueue();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const longestField = [...REGISTRY_FIELDS].sort((a, b) => b.field_id.length - a.field_id.length)[0];
    await expect(enqueueMining({ ...MSG, field_id: longestField.field_id })).resolves.toEqual({
      ok: true,
      queued: true,
    });

    expect(Buffer.byteLength(wireBody(fetchMock), 'utf8')).toBeLessThan(1024);
  });

  // The load-bearing property of this transport: a third-party queue may carry pointers to
  // facts, never facts. The corpus being mined demonstrably contains door codes and WiFi
  // passwords, so id fields are held to uuid shape rather than to a length-capped charset.
  // A charset cap was the first attempt and it failed on exactly these values: `4821` and
  // `hunter2` are both id-shaped.
  it.each([
    ['4821', 'a door code'],
    ['hunter2', 'a password'],
    ['Tr0ub4dor-3', 'a password with separators'],
    ['aGVsbG93b3JsZDEyMw', 'a base64-ish blob'],
    ['wifi password is hunter2', 'a sentence'],
  ])('refuses %s in property_id (%s)', async (value) => {
    configureQueue();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(enqueueMining({ ...MSG, property_id: value })).resolves.toEqual({
      ok: false,
      queued: false,
      reason: 'invalid',
      detail: 'property_id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['4821', 'hunter2', 'conv-1', 'aGVsbG93b3JsZDEyMw'])(
    'refuses %s in source_id',
    async (value) => {
      configureQueue();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(enqueueMining({ ...MSG, source_id: value })).resolves.toEqual({
        ok: false,
        queued: false,
        reason: 'invalid',
        detail: 'source_id',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  // A caller-supplied dedupe key was the last free-text channel on this message. It is no
  // longer accepted at all, so supplying one cannot influence the wire.
  it('ignores a caller-supplied dedupe key and derives its own', async () => {
    configureQueue();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const smuggled = { ...MSG, dedupe_key: 'wifi password is hunter2, door code 4821' } as MiningMessage;
    await expect(enqueueMining(smuggled)).resolves.toEqual({ ok: true, queued: true });

    const raw = wireBody(fetchMock);
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('4821');
    expect(JSON.parse(raw).body).toEqual(WIRE);
  });

  it('strips any extra property rather than serializing it', async () => {
    configureQueue();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const extra = { ...MSG, payload: { secret: 'hunter2' }, note: 'door code 4821' } as MiningMessage;
    await expect(enqueueMining(extra)).resolves.toEqual({ ok: true, queued: true });

    const raw = wireBody(fetchMock);
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('4821');
    // Equality, not a subset check: anything the rebuild failed to drop shows up here.
    expect(JSON.parse(raw).body).toEqual(WIRE);
  });

  // Round-three review defeated the previous fix without violating the type: validation
  // read the caller's object, then serialization read it again, and a member is free to
  // answer differently each time. These are that exact attack.
  describe('cannot be defeated by a member that answers twice', () => {
    it('refuses a getter that returns a uuid then a secret', async () => {
      configureQueue();
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      let reads = 0;
      const attack = {
        ...MSG,
        get property_id() {
          reads += 1;
          return reads === 1 ? PROPERTY_ID : 'wifi password hunter2';
        },
      } as MiningMessage;

      const res = await enqueueMining(attack);

      // Either it is refused, or it is sent with the first-read value. What must never
      // happen is the secret reaching the wire.
      if (res.ok) {
        const raw = wireBody(fetchMock);
        expect(raw).not.toContain('hunter2');
        expect(JSON.parse(raw).body).toEqual(WIRE);
      }
      expect(reads).toBeLessThanOrEqual(1);
    });

    it('refuses an object that coerces to a uuid but serializes as a secret', async () => {
      configureQueue();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const coercing = {
        toString: () => PROPERTY_ID,
        toJSON: () => 'door code 4821',
      };
      const attack = { ...MSG, property_id: coercing } as unknown as MiningMessage;

      await expect(enqueueMining(attack)).resolves.toEqual({
        ok: false,
        queued: false,
        reason: 'invalid',
        detail: 'property_id',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a non-string in every free-typed member', async () => {
      configureQueue();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const members: Array<[string, unknown]> = [
        ['kind', { toString: () => 'conversation_correction' }],
        ['signal', { toString: () => 'no_stored_value' }],
        ['property_id', { toString: () => PROPERTY_ID }],
        ['source_id', { toString: () => SOURCE_ID }],
        ['field_id', { toString: () => 'checkout_time' }],
        ['occurred_at', { toString: () => '2026-06-01T12:00:00.000Z' }],
      ];

      for (const [field, value] of members) {
        await expect(
          enqueueMining({ ...MSG, [field]: value } as unknown as MiningMessage),
        ).resolves.toEqual({ ok: false, queued: false, reason: 'invalid', detail: field });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a toJSON hook on the message itself', async () => {
      configureQueue();
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const attack = { ...MSG, toJSON: () => ({ leak: 'hunter2 / 4821' }) } as unknown as MiningMessage;
      await expect(enqueueMining(attack)).resolves.toEqual({ ok: true, queued: true });

      const raw = wireBody(fetchMock);
      expect(raw).not.toContain('hunter2');
      expect(raw).not.toContain('4821');
      expect(JSON.parse(raw).body).toEqual(WIRE);
    });
  });

  it('rejects a field_id that is not in the registry', async () => {
    configureQueue();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(enqueueMining({ ...MSG, field_id: 'not_a_registry_field' })).resolves.toMatchObject({
      reason: 'invalid',
      detail: 'field_id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unparseable timestamp', async () => {
    configureQueue();
    vi.stubGlobal('fetch', vi.fn());
    await expect(enqueueMining({ ...MSG, occurred_at: 'whenever' })).resolves.toMatchObject({
      reason: 'invalid',
      detail: 'occurred_at',
    });
  });

  // Date.parse accepts a bare number as a year, so a door code passes validation as a
  // timestamp. Normalizing on the way out means it cannot reach the queue as typed.
  it('normalizes the timestamp so a numeric value cannot ride out verbatim', async () => {
    configureQueue();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(enqueueMining({ ...MSG, occurred_at: '4821' })).resolves.toEqual({ ok: true, queued: true });
    expect(JSON.parse(wireBody(fetchMock)).body.occurred_at).toBe('4821-01-01T00:00:00.000Z');
  });

  it.each(['not_a_kind', ''])('rejects an unknown kind (%s)', async (kind) => {
    configureQueue();
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      enqueueMining({ ...MSG, kind } as unknown as MiningMessage),
    ).resolves.toMatchObject({ reason: 'invalid', detail: 'kind' });
  });

  it('rejects a signal outside the enum', async () => {
    configureQueue();
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      enqueueMining({ ...MSG, signal: 'door code is 4821' } as unknown as MiningMessage),
    ).resolves.toMatchObject({ reason: 'invalid', detail: 'signal' });
  });

  it('derives a stable dedupe key', () => {
    expect(miningDedupeKey('conversation_gap', 'p1', 's1', 'parking')).toBe('conversation_gap:p1:s1:parking');
    expect(miningDedupeKey('conversation_gap', 'p1', 's1')).toBe('conversation_gap:p1:s1:-');
  });
});

describe('brain-write dispatch (§9 / §9.0a)', () => {
  it('is unconfigured until the flag, url and secret all agree', () => {
    expect(brainWriteWorkerConfigured()).toBe(false);
    env.brainWriteWorkerEnabled = true;
    env.brainWriteWorkerUrl = 'https://worker.example.com/brain-write';
    expect(brainWriteWorkerConfigured()).toBe(false);
    env.brainWriteWorkerSecret = 'shh';
    expect(brainWriteWorkerConfigured()).toBe(true);
  });

  it('refuses a guest-path write when the worker is unavailable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(dispatchBrainWrite(JOB)).resolves.toEqual({
      channel: 'refused',
      dispatched: false,
      reason: 'worker_unavailable_on_guest_path',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never returns inline_allowed for a guest conversation, configured or not', async () => {
    for (const configured of [false, true]) {
      env.brainWriteWorkerEnabled = configured;
      env.brainWriteWorkerUrl = configured ? 'https://worker.example.com/brain-write' : '';
      env.brainWriteWorkerSecret = configured ? 'shh' : '';
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
      const out = await dispatchBrainWrite(JOB);
      expect(out.channel).not.toBe('inline_allowed');
    }
  });

  it('permits an inline host-initiated write when the worker is off', async () => {
    await expect(dispatchBrainWrite({ ...JOB, origin: 'host_initiated' })).resolves.toEqual({
      channel: 'inline_allowed',
      dispatched: false,
      reason: 'worker_disabled',
    });
  });

  it('dispatches to the worker with the shared secret header', async () => {
    env.brainWriteWorkerEnabled = true;
    env.brainWriteWorkerUrl = 'https://worker.example.com/brain-write';
    env.brainWriteWorkerSecret = 'shh';
    const fetchMock = vi.fn(async () => new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchBrainWrite(JOB)).resolves.toEqual({ channel: 'worker', dispatched: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://worker.example.com/brain-write');
    expect((init.headers as Record<string, string>)['X-Moche-Worker-Secret']).toBe('shh');
    expect(JSON.parse(init.body as string)).toEqual(JOB);
  });

  it('reports a failed dispatch rather than swallowing it', async () => {
    env.brainWriteWorkerEnabled = true;
    env.brainWriteWorkerUrl = 'https://worker.example.com/brain-write';
    env.brainWriteWorkerSecret = 'shh';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    await expect(dispatchBrainWrite({ ...JOB, origin: 'host_initiated' })).resolves.toMatchObject({
      channel: 'refused',
      reason: 'dispatch_failed',
    });
  });

  it('carries no fact content in the job payload', () => {
    // The worker re-reads the candidate row under its own authorization. Shipping the
    // value through the queue would put a vault-routed secret in a message body.
    expect(Object.keys(JOB).sort()).toEqual([
      'candidate_id',
      'field_id',
      'origin',
      'property_id',
      'requested_at',
      'supersedes_id',
    ]);
  });
});
