import 'server-only';
import { isProductionRuntime, publicEnv, resolveTwilioAuth, serverEnv } from '@/lib/env';

type ReadState = 'available' | 'not_configured' | 'not_authorized' | 'unavailable';
type ProviderRead = { state: ReadState; body?: unknown };
const RESEND_URL = 'https://api.resend.com/domains';
const TRIGGER_URL = 'https://api.trigger.dev/api/v1/deployments?page%5Bsize%5D=5';
const DEPLOYMENT_STATUSES = new Set(['PENDING', 'BUILDING', 'DEPLOYING', 'DEPLOYED', 'FAILED', 'CANCELED', 'TIMED_OUT']);
const DOMAIN_STATUSES = new Set(['not_started', 'pending', 'verified', 'partially_verified', 'partially_failed', 'failed', 'temporary_failure']);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function readProvider(url: string, key: string, fetcher: typeof fetch, scheme: 'Bearer' | 'Basic' = 'Bearer'): Promise<ProviderRead> {
  if (!key) return { state: 'not_configured' };
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Authorization: `${scheme} ${key}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 401 || response.status === 403) return { state: 'not_authorized' };
    if (!response.ok) return { state: 'unavailable' };
    return { state: 'available', body: await response.json() };
  } catch {
    // Provider responses/errors can contain credentials or personal data. Never log them.
    return { state: 'unavailable' };
  }
}

async function readTwilioWebhook(auth: ReturnType<typeof resolveTwilioAuth>, fetcher: typeof fetch) {
  // Account path cannot escape the fixed origin; a full E.164 filter prevents broad reads.
  const configurationValid = Boolean(auth && /^AC[0-9a-fA-F]{32}$/.test(auth.accountSid)
    && /^\+[1-9]\d{7,14}$/.test(auth.fromNumber));
  let expectedUrl: string | null = null;
  try {
    const base = new URL(publicEnv.appUrl);
    // Exactly the same canonicalization as the signed inbound webhook route.
    if (base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash) {
      expectedUrl = new URL('/api/webhooks/twilio', base).toString();
    }
  } catch { /* Invalid app URL is configuration status, never a logged value. */ }
  const result: ProviderRead = auth && configurationValid
    ? await readProvider(
      `https://api.twilio.com/2010-04-01/Accounts/${auth.accountSid}/IncomingPhoneNumbers.json?${new URLSearchParams({ PhoneNumber: auth.fromNumber, PageSize: '1' })}`,
      auth.authHeader, fetcher, 'Basic',
    ) : { state: 'not_configured' };
  const numbers = record(result.body).incoming_phone_numbers;
  const number = Array.isArray(numbers)
    ? numbers.find((item: unknown) => record(item).phone_number === auth?.fromNumber) : undefined;
  const fields = record(number);
  const urlMatches = number && expectedUrl ? fields.sms_url === expectedUrl : null;
  const methodPost = number ? fields.sms_method === 'POST' : null;
  // TwiML application settings override the number's sms_url; do not report a false green.
  const applicationOverride = number && typeof fields.sms_application_sid === 'string'
    ? fields.sms_application_sid.length > 0 : null;
  return {
    configurationValid,
    callbackBaseValid: Boolean(expectedUrl),
    metadata: result.state === 'available' && !Array.isArray(numbers) ? 'unavailable' : result.state,
    senderFound: Array.isArray(numbers) ? Boolean(number) : null,
    urlMatches,
    methodPost,
    applicationOverride,
    callbackMatches: urlMatches === null || methodPost === null || applicationOverride === null
      ? null : urlMatches && methodPost && !applicationOverride,
  };
}

/** Call only after founder authorization. GET metadata only; never a delivery test. */
export async function getIntegrationReadiness(fetcher: typeof fetch = fetch) {
  const productionRuntime = isProductionRuntime();
  const twilioAuth = resolveTwilioAuth();
  const authConfigured = Boolean(twilioAuth);
  // Use the same resolved production-only switch as the SMS transport.
  const deliveryEnabled = serverEnv.smsDeliveryEnabled === true;
  const triggerKey = process.env.TRIGGER_SECRET_KEY ?? '';
  const productionKey = triggerKey.startsWith('tr_prod_');
  const [resend, trigger, inboundWebhook] = await Promise.all([
    readProvider(RESEND_URL, serverEnv.resendApiKey, fetcher),
    readProvider(TRIGGER_URL, productionKey ? triggerKey : '', fetcher),
    readTwilioWebhook(twilioAuth, fetcher),
  ]);
  const domains = record(resend.body).data;
  const domain = Array.isArray(domains)
    ? record(domains.find((d: unknown) => record(d).name === 'moche-ai.com')) : {};
  const domainStatus = typeof domain.status === 'string' && DOMAIN_STATUSES.has(domain.status) ? domain.status : 'unknown';
  const deployments = record(trigger.body).data;
  const statuses = Array.isArray(deployments) ? deployments.slice(0, 5).map((d: unknown) => {
    const status = record(d).status;
    return typeof status === 'string' && DEPLOYMENT_STATUSES.has(status) ? status : 'unknown';
  }) : [];
  return {
    checkedAt: new Date().toISOString(),
    productionRuntime,
    sms: {
      authConfigured,
      deliveryEnabled,
      notificationFanoutEnabled: serverEnv.notifySmsEnabled === true,
      transportConfigured: productionRuntime && deliveryEnabled && authConfigured,
      inboundWebhook,
      delivery: 'not_tested',
    },
    cron: { configured: Boolean(serverEnv.cronSecret) },
    resend: {
      configured: Boolean(serverEnv.resendApiKey),
      metadata: resend.state === 'available' && !Array.isArray(domains) ? 'unavailable' : resend.state,
      domainFound: Array.isArray(domains) ? domain.name === 'moche-ai.com' : null,
      domainStatus,
      sendingEnabled: record(domain.capabilities).sending === 'enabled' ? true
        : record(domain.capabilities).sending === 'disabled' ? false : null,
      hasMore: record(resend.body).has_more === true,
      // A sending-only key may correctly receive 403 on domain reads.
      sendingAuthorization: 'not_tested',
      delivery: 'not_tested',
    },
    trigger: {
      configured: Boolean(triggerKey),
      productionKey,
      metadata: trigger.state === 'available' && !Array.isArray(deployments) ? 'unavailable' : trigger.state,
      deploymentStatuses: statuses,
      hasDeployedVersion: Array.isArray(deployments) ? statuses.includes('DEPLOYED') : null,
      taskCatalog: 'not_checked',
      execution: 'not_tested',
      nativeGitHubIntegration: 'not_checked',
    },
  };
}
