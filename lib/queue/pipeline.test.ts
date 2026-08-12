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

const MSG: MiningMessage = {
  kind: 'conversation_correction',
  property_id: 'ba52ae45-2126-4d50-871d-03f9722b9633',
  source_id: 'conv-1',
  dedupe_key: 'conversation_correction:ba52ae45:conv-1:wifi_password',
  occurred_at: '2026-06-01T12:00:00.000Z',
  payload: { observed: 'guest says checkout is 11, brain says 10' },
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
    expect(sent.body).toEqual(MSG);
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

  it('drops an oversized message instead of truncating it', async () => {
    configureQueue();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const huge: MiningMessage = { ...MSG, payload: { blob: 'x'.repeat(200 * 1024) } };
    await expect(enqueueMining(huge)).resolves.toEqual({ ok: false, queued: false, reason: 'too_large' });
    expect(fetchMock).not.toHaveBeenCalled();
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
