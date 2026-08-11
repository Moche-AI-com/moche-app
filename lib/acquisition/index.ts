import 'server-only';
import { assertPublicUrl, SsrfError } from '@/lib/net/ssrf';
import { serverEnv } from '@/lib/env';
import { profileFor, type AcquisitionProfileName } from './profiles';
import { AcquisitionError, type AcquisitionAttempt, type AcquisitionContext, type AcquisitionErrorReason, type AcquisitionProvider, type AcquisitionResult } from './types';
import { staticHttpProvider } from './providers/static-http';
import { firecrawlProvider } from './providers/firecrawl';
import { crawl4aiProvider } from './providers/crawl4ai';

const providers: AcquisitionProvider[] = [firecrawlProvider, crawl4aiProvider, staticHttpProvider];

function reasonFor(error: unknown): AcquisitionErrorReason {
  if (error instanceof SsrfError) return 'unsafe_target';
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403 || status === 429) return 'blocked';
  if (/too large|size/i.test(error instanceof Error ? error.message : '')) return 'too_large';
  return 'unreachable';
}

function messageFor(reason: AcquisitionErrorReason): string {
  if (reason === 'blocked') return 'That site is blocking automated access. Open it and paste the details in manually instead.';
  if (reason === 'unsafe_target') return 'That URL points to an address that is not allowed.';
  if (reason === 'too_large') return 'That page is too large to import safely.';
  if (reason === 'empty') return 'No readable text was found on that page. Try pasting the listing details manually.';
  return 'Could not fetch that URL. Try again or paste the details manually.';
}

async function record(context: AcquisitionContext | undefined, attempt: AcquisitionAttempt): Promise<void> {
  await context?.onAttempt?.(attempt);
}

async function runShadow(url: URL, profileName: AcquisitionProfileName, primaryName: string, context?: AcquisitionContext): Promise<void> {
  const name = serverEnv.acquisitionShadowProvider;
  if (!name || name === primaryName) return;
  const provider = providers.find((candidate) => candidate.name === name && candidate.supports(profileFor(profileName)));
  if (!provider) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), profileFor(profileName).timeoutMs);
  const started = Date.now();
  try {
    const result = await provider.fetch(url, profileFor(profileName), controller.signal);
    await record(context, { provider: provider.name, result, latencyMs: Date.now() - started, isShadow: true });
  } catch (error) {
    await record(context, { provider: provider.name, errorReason: reasonFor(error), httpStatus: (error as { status?: number })?.status ?? null, latencyMs: Date.now() - started, isShadow: true });
  } finally { clearTimeout(timer); }
}

export async function acquire(rawUrl: string, profileName: AcquisitionProfileName, context?: AcquisitionContext): Promise<AcquisitionResult> {
  const url = await assertPublicUrl(rawUrl);
  const profile = profileFor(profileName);
  let lastReason: AcquisitionErrorReason = 'unreachable';
  for (const provider of providers) {
    if (!provider.supports(profile)) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), profile.timeoutMs);
    const started = Date.now();
    try {
      const result = await provider.fetch(url, profile, controller.signal);
      if (result.text.length < profile.minTextLength) {
        lastReason = 'empty';
        await record(context, { provider: provider.name, result, errorReason: 'empty', latencyMs: Date.now() - started, isShadow: false });
        continue;
      }
      await record(context, { provider: provider.name, result, latencyMs: Date.now() - started, isShadow: false });
      void runShadow(url, profileName, provider.name, context);
      return result;
    } catch (error) {
      lastReason = reasonFor(error);
      await record(context, { provider: provider.name, errorReason: lastReason, httpStatus: (error as { status?: number })?.status ?? null, latencyMs: Date.now() - started, isShadow: false });
      if (error instanceof SsrfError) throw new AcquisitionError('unsafe_target', messageFor('unsafe_target'));
    } finally { clearTimeout(timer); }
  }
  throw new AcquisitionError(lastReason, messageFor(lastReason));
}

export { AcquisitionError } from './types';
export type { AcquisitionResult } from './types';
