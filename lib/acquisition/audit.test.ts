import { describe, expect, it, vi } from 'vitest';
import { acquisitionAuditContext, recordManualSource } from './audit';

function client(failure?: string) {
  const writes: Array<{ table: string; value: any }> = [];
  const from = vi.fn((table: string) => ({
    insert(value: any) {
      writes.push({ table, value });
      const result = { data: table === 'ingestion_artifacts' ? { id: 'artifact' } : null,
        error: table === failure ? { code: '42501', message: 'private canary' } : null };
      return { ...result, select: () => ({ single: async () => result }) };
    },
    update: () => ({ eq: async () => ({ error: null }) }),
  }));
  return { admin: { from } as any, writes };
}
const input = {
  propertyId: 'property', sourceId: 'source', profile: 'manual_site_v1',
  title: 'Safety manual', text: `${'A'.repeat(24_000)}\nDo not remove the safety guard.`,
  provider: 'manual-text',
};

describe('original-source retention is required before review', () => {
  it.each(['ingestion_artifacts', 'source_documents'])('fails closed when %s cannot persist', async (table) => {
    const { admin } = client(table);
    await expect(recordManualSource(admin, input)).rejects.toThrow('source_retention_failed');
  });

  it('retains the entire long source and trailing warning', async () => {
    const { admin, writes } = client();
    await recordManualSource(admin, input);
    expect(writes.find((write) => write.table === 'source_documents')?.value.text).toBe(input.text);
  });

  it('does not silently truncate an oversized original', async () => {
    const { admin } = client();
    await expect(recordManualSource(admin, { ...input, text: 'A'.repeat(200_001) }))
      .rejects.toThrow('source_retention_failed');
  });

  it('does not make a failed shadow audit fatal to a saved primary', async () => {
    const { admin } = client('ingestion_artifacts');
    await expect(acquisitionAuditContext(admin, input).onAttempt?.({
      provider: 'shadow', isShadow: true, latencyMs: 1, errorReason: 'unreachable',
    })).resolves.toBeUndefined();
  });
});
