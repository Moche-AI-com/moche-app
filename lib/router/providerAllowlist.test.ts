import { describe, it, expect } from 'vitest';
import {
  PROVIDER_ROUTING_POLICY,
  ProviderIneligibleError,
  REVIEWED_GUEST_MODELS,
  REVIEWED_ZERO_RETENTION_PROVIDERS,
  allowedProviderSlugs,
  parseAllowlist,
  providerBlock,
  routineGuestModelChain,
} from './providerAllowlist';

const env = (models: string, providers = '') => ({
  openrouterGuestModelAllowlist: models,
  openrouterProviderAllowlist: providers,
});

describe('parseAllowlist', () => {
  it('trims, lowercases, drops empties, and de-duplicates', () => {
    expect(parseAllowlist(' OpenAI/GPT-4o-mini , ,openai/gpt-4o-mini, azure ')).toEqual([
      'openai/gpt-4o-mini',
      'azure',
    ]);
  });

  it('treats unset and empty as no allowlist', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(parseAllowlist('  ,  ')).toEqual([]);
  });
});

describe('routineGuestModelChain', () => {
  it('preserves the operator-supplied order', () => {
    expect(routineGuestModelChain(env('openai/gpt-4o-mini,google/gemini-2.5-flash'))).toEqual([
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash',
    ]);
  });

  // The core §0.2 row 3 guarantee: no allowlist means no external guest route at all.
  it('fails closed with provider_ineligible when the allowlist is empty', () => {
    expect(() => routineGuestModelChain(env(''))).toThrow(ProviderIneligibleError);
    try {
      routineGuestModelChain(env(''));
    } catch (e) {
      expect((e as ProviderIneligibleError).code).toBe('provider_ineligible');
    }
  });

  // An env value may narrow the reviewed set but must never widen it.
  it('drops unreviewed slugs and fails closed if nothing reviewed remains', () => {
    expect(routineGuestModelChain(env('some/unreviewed-model,openai/gpt-4o-mini'))).toEqual([
      'openai/gpt-4o-mini',
    ]);
    expect(() => routineGuestModelChain(env('some/unreviewed-model'))).toThrow(
      ProviderIneligibleError,
    );
  });

  it('accepts every slug in the reviewed set', () => {
    expect(routineGuestModelChain(env(REVIEWED_GUEST_MODELS.join(',')))).toEqual([
      ...REVIEWED_GUEST_MODELS,
    ]);
  });
});

describe('allowedProviderSlugs', () => {
  // Unset means "no operator preference", which pins the full reviewed set rather than
  // omitting `only`. Omitting it would delegate provider choice to OpenRouter's own ZDR
  // classification — the exact condition this allowlist exists to backstop.
  it('pins the full reviewed set when unset', () => {
    expect(allowedProviderSlugs(env('openai/gpt-4o-mini', ''))).toEqual([
      ...REVIEWED_ZERO_RETENTION_PROVIDERS,
    ]);
  });

  it('narrows to reviewed zero-retention providers', () => {
    expect(allowedProviderSlugs(env('openai/gpt-4o-mini', 'azure,some-random-host'))).toEqual([
      'azure',
    ]);
  });

  // An env naming only unreviewed providers is an operator error, not a preference.
  // Failing closed is the only option that neither ignores the narrowing nor widens
  // routing past review.
  it('throws when no requested provider is reviewed', () => {
    expect(() => allowedProviderSlugs(env('openai/gpt-4o-mini', 'some-random-host'))).toThrow(
      ProviderIneligibleError,
    );
  });

  it('accepts every slug in the reviewed provider set', () => {
    expect(
      allowedProviderSlugs(env('openai/gpt-4o-mini', REVIEWED_ZERO_RETENTION_PROVIDERS.join(','))),
    ).toEqual([...REVIEWED_ZERO_RETENTION_PROVIDERS]);
  });
});

describe('PROVIDER_ROUTING_POLICY', () => {
  // Directive §1 specifies this block field-for-field. Asserted literally because a
  // silent drift here changes where guest text is allowed to go.
  it('matches directive §1 exactly', () => {
    expect(PROVIDER_ROUTING_POLICY).toEqual({
      require_parameters: true,
      zdr: true,
      data_collection: 'deny',
      allow_fallbacks: true,
      sort: { by: 'latency', partition: 'model' },
    });
  });

  // `partition: 'none'` sorts endpoints globally across the `models` array, which would
  // let routing serve a cheaper unreviewed fallback ahead of the reviewed primary.
  it('partitions by model so routing cannot drift off the reviewed primary', () => {
    expect(PROVIDER_ROUTING_POLICY.sort.partition).toBe('model');
  });

  it('does not carry a top-level partition key', () => {
    expect('partition' in PROVIDER_ROUTING_POLICY).toBe(false);
  });
});

describe('providerBlock', () => {
  it('always pins `only`, even with no env allowlist', () => {
    expect(providerBlock(env('openai/gpt-4o-mini')).only).toEqual([
      ...REVIEWED_ZERO_RETENTION_PROVIDERS,
    ]);
  });

  it('refuses rather than emitting an unpinned block', () => {
    expect(() => providerBlock(env('openai/gpt-4o-mini', 'some-random-host'))).toThrow(
      ProviderIneligibleError,
    );
  });

  it('pins `only` to the reviewed providers when configured', () => {
    expect(providerBlock(env('openai/gpt-4o-mini', 'azure,openai')).only).toEqual([
      'azure',
      'openai',
    ]);
  });

  it('never mutates the shared policy object', () => {
    const block = providerBlock(env('openai/gpt-4o-mini', 'azure'));
    expect(block).not.toBe(PROVIDER_ROUTING_POLICY);
    expect(PROVIDER_ROUTING_POLICY).not.toHaveProperty('only');
  });
});
