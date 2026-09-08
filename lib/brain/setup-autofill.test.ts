import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autofillBrainFromSegments, isInitialSetup, shouldAutofill } from './setup-autofill';
import type { AutofillInput } from './setup-autofill';

const mocks = vi.hoisted(() => ({ ingest: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/ingest/pipeline', () => ({ ingestText: mocks.ingest }));
vi.mock('@/lib/audit', () => ({ audit: mocks.audit }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ingest.mockResolvedValue({ brainItemId: 'unapproved-item' });
});

describe('shouldAutofill', () => {
  it('requires human approval even for an empty draft property', () => {
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: 0 })).toBe(false);
  });

  it('refuses a draft property that already has a non-deleted Brain item', () => {
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: 1 })).toBe(false);
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: 4 })).toBe(false);
  });

  it('refuses all non-draft states even when the Brain is empty', () => {
    expect(shouldAutofill({ status: 'live', existingBrainItemCount: 0 })).toBe(false);
    expect(shouldAutofill({ status: 'paused', existingBrainItemCount: 0 })).toBe(false);
    expect(shouldAutofill({ status: 'archived', existingBrainItemCount: 0 })).toBe(false);
  });

  it('does not treat an invalid negative count as an empty Brain', () => {
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: -1 })).toBe(false);
  });
});

describe('retired automatic setup write boundary', () => {
  it('never treats an empty database-backed draft as permission to publish', async () => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'draft' }, error: null }),
      is: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    const client = { from: vi.fn(() => query) };
    expect(await isInitialSetup(client as never, 'property')).toBe(false);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });

  it.each(['listing_url', 'document', 'text_paste'] as const)(
    'rejects direct %s filing without calling a canonical writer or claiming approval',
    async (sourceType) => {
      const client = { from: vi.fn(), rpc: vi.fn() };
      const input: AutofillInput = {
        propertyId: 'empty-draft', hostAccountId: 'host', actorProfileId: 'host',
        sourceType, segments: [{
          title: 'Checkout', text: 'Checkout is at 11 am every morning.',
          category: 'checkin_checkout', visibility: 'guest', confidence: 1,
        }],
      };
      await expect(autofillBrainFromSegments(client as never, input)).rejects.toThrow(/proposal|approval/i);
      expect(mocks.ingest).not.toHaveBeenCalled();
      expect(client.from).not.toHaveBeenCalled();
      expect(client.rpc).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );
});
