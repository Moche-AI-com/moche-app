import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ctx: null as null | { isFounder: boolean },
  sessionFails: false,
  env: { resendApiKey: '', cronSecret: '', notifySmsEnabled: false, smsDeliveryEnabled: false },
  production: true,
  auth: true,
  accountSid: '',
  fromNumber: '+12025550123',
  publicEnv: { appUrl: 'https://app.example.test' },
}));
vi.mock('@/lib/auth/guards', () => ({
  getSessionContext: async () => {
    if (state.sessionFails) throw new Error('synthetic private error');
    return state.ctx;
  },
}));
vi.mock('@/lib/env', () => ({
  serverEnv: state.env,
  publicEnv: state.publicEnv,
  isProductionRuntime: () => state.production,
  resolveTwilioAuth: () => state.auth ? {
    authHeader: 'synthetic-secret', fromNumber: state.fromNumber, accountSid: state.accountSid,
  } : null,
}));
import { GET } from '@/app/api/internal/integrations/readiness/route';
import { getIntegrationReadiness } from '@/lib/integrations/readiness';

beforeEach(() => {
  vi.unstubAllEnvs();
  state.ctx = null; state.sessionFails = false; state.production = true; state.auth = true;
  state.accountSid = ''; state.fromNumber = '+12025550123'; state.publicEnv.appUrl = 'https://app.example.test';
  Object.assign(state.env, { resendApiKey: '', cronSecret: '', notifySmsEnabled: false, smsDeliveryEnabled: false });
  vi.stubEnv('TRIGGER_SECRET_KEY', '');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network'); }));
});

it.each([null, { isFounder: false }])('denies anonymous and tenant-only access before any provider request: %s', async (ctx) => {
  state.ctx = ctx;
  state.accountSid = `AC${'a'.repeat(32)}`;
  state.env.resendApiKey = 'synthetic';
  vi.stubEnv('TRIGGER_SECRET_KEY', 'tr_prod_synthetic');
  const response = await GET();
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('');
  expect(fetch).not.toHaveBeenCalled();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('fails closed when the protected claim cannot be read', async () => {
  state.sessionFails = true;
  state.accountSid = `AC${'a'.repeat(32)}`;
  expect((await GET()).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
it('does not contact providers for absent keys and uses the actual resolved SMS gate', async () => {
  state.ctx = { isFounder: true };
  const data = await (await GET()).json();
  expect(data.sms.transportConfigured).toBe(false);
  expect(data.resend.metadata).toBe('not_configured');
  expect(fetch).not.toHaveBeenCalled();
  state.env.smsDeliveryEnabled = true;
  expect((await getIntegrationReadiness()).sms.transportConfigured).toBe(true);
  state.production = false;
  expect((await getIntegrationReadiness()).sms.transportConfigured).toBe(false);
});
it('uses fixed bounded GETs and never returns provider content or credentials', async () => {
  state.ctx = { isFounder: true };
  state.env.resendApiKey = 'synthetic-resend-secret';
  vi.stubEnv('TRIGGER_SECRET_KEY', 'tr_prod_synthetic-only');
  const request = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.method).toBe('GET');
    expect(options.redirect).toBe('error');
    expect(options.cache).toBe('no-store');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect([ 'https://api.resend.com/domains', 'https://api.trigger.dev/api/v1/deployments?page%5Bsize%5D=5' ]).toContain(url);
    return Response.json(url.includes('resend') ? {
      data: [{ name: 'moche-ai.com', status: 'verified', capabilities: { sending: 'enabled' }, private: 'synthetic-private-body' }],
    } : { data: [{ status: 'DEPLOYED', payload: 'synthetic-private-body', git: { author: 'private-person' } }] });
  });
  vi.stubGlobal('fetch', request);
  const response = await GET();
  const data = await response.json();
  expect(data.resend.domainStatus).toBe('verified');
  expect(data.trigger.hasDeployedVersion).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(data)).not.toMatch(/synthetic|private-person|authHeader|payload/);
});
it('treats sending-only domain 403 as read authorization unknown, not invalid sending', async () => {
  state.env.resendApiKey = 'synthetic';
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private error', { status: 403 })));
  const data = await getIntegrationReadiness();
  expect(data.resend.metadata).toBe('not_authorized');
  expect(data.resend.sendingAuthorization).toBe('not_tested');
  expect(data.resend.domainFound).toBeNull();
});
it.each(['throw', 'invalid', 'partial'])('sanitizes unavailable/partial provider responses: %s', async (mode) => {
  state.env.resendApiKey = 'synthetic';
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (mode === 'throw') throw new Error('synthetic-private-body');
    if (mode === 'invalid') return new Response('synthetic-private-body', { status: 200 });
    return Response.json({ data: [{ name: 'moche-ai.com', status: 'partially_verified' }] });
  }));
  const result = await getIntegrationReadiness();
  expect(result.resend.sendingEnabled).toBeNull();
  expect(JSON.stringify(result)).not.toContain('synthetic-private-body');
});
it('never queries Trigger with a nonproduction environment key', async () => {
  vi.stubEnv('TRIGGER_SECRET_KEY', 'tr_dev_synthetic');
  expect((await getIntegrationReadiness()).trigger.productionKey).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('reads only the configured Twilio number with Basic auth and emits callback booleans', async () => {
  state.ctx = { isFounder: true };
  state.accountSid = `AC${'a'.repeat(32)}`;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${state.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=%2B12025550123&PageSize=1`);
    expect(options).toMatchObject({
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: 'Basic synthetic-secret' },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ incoming_phone_numbers: [{
      phone_number: state.fromNumber, sid: 'synthetic-private-sid',
      sms_url: 'https://app.example.test/api/webhooks/twilio',
      sms_method: 'POST', sms_application_sid: '',
    }] });
  }));
  const data = await (await GET()).json();
  expect(data.sms.inboundWebhook).toMatchObject({
    metadata: 'available', senderFound: true, urlMatches: true, methodPost: true,
    applicationOverride: false, callbackMatches: true,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(data)).not.toMatch(/synthetic|12025550123|https:|AC[a-f0-9]{32}/);
});

it.each([401, 403])('does not confuse Twilio read denial %s with send failure', async (status) => {
  state.accountSid = `AC${'a'.repeat(32)}`;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('synthetic-private', { status })));
  const data = await getIntegrationReadiness();
  expect(data.sms.inboundWebhook.metadata).toBe('not_authorized');
  expect(data.sms.inboundWebhook.callbackMatches).toBeNull();
  expect(data.sms.delivery).toBe('not_tested');
  expect(JSON.stringify(data)).not.toContain('synthetic-private');
});

it.each(['AC../escape', 'ACbad', 'https://other.test'])('does not interpolate invalid Twilio account IDs: %s', async (sid) => {
  state.accountSid = sid;
  expect((await getIntegrationReadiness()).sms.inboundWebhook.configurationValid).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['*', '555', '+12025550123&PageSize=100'])('rejects non-exact sender filters: %s', async (phone) => {
  state.accountSid = `AC${'a'.repeat(32)}`;
  state.fromNumber = phone;
  expect((await getIntegrationReadiness()).sms.inboundWebhook.configurationValid).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('uses the callback signature canonicalization and rejects an unsafe app base', async () => {
  state.accountSid = `AC${'a'.repeat(32)}`;
  state.publicEnv.appUrl = 'https://app.example.test?extra=1';
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    incoming_phone_numbers: [{
      phone_number: state.fromNumber, sms_url: 'https://app.example.test/api/webhooks/twilio',
      sms_method: 'POST', sms_application_sid: '',
    }],
  })));
  const data = await getIntegrationReadiness();
  expect(data.sms.inboundWebhook.callbackBaseValid).toBe(false);
  expect(data.sms.inboundWebhook.callbackMatches).toBeNull();
});

it.each([
  { sms_url: 'https://other.test/api/webhooks/twilio', sms_method: 'POST', sms_application_sid: '' },
  { sms_url: 'https://app.example.test/api/webhooks/twilio', sms_method: 'GET', sms_application_sid: '' },
  { sms_url: 'https://app.example.test/api/webhooks/twilio', sms_method: 'POST', sms_application_sid: 'APsynthetic' },
])('does not report mismatched or application-overridden callbacks as configured', async (fields) => {
  state.accountSid = `AC${'a'.repeat(32)}`;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    incoming_phone_numbers: [{ phone_number: state.fromNumber, ...fields }],
  })));
  expect((await getIntegrationReadiness()).sms.inboundWebhook.callbackMatches).toBe(false);
});

it('treats absent sender metadata as unknown and never follows pagination', async () => {
  state.accountSid = `AC${'a'.repeat(32)}`;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    incoming_phone_numbers: [], next_page_uri: 'https://other.test/private',
  })));
  const data = await getIntegrationReadiness();
  expect(data.sms.inboundWebhook.senderFound).toBe(false);
  expect(data.sms.inboundWebhook.callbackMatches).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
