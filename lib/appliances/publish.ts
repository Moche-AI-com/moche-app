import 'server-only';

// Shared-catalog publishing (Manage Brain redesign, slice 4b; decisions D1/D2).
//
// The catalog compounds with host effort at zero crawl cost: when a host approves a
// manual section for a catalog-linked appliance, that reviewed section becomes shared
// knowledge every future property with the same model can pull down. Two hard rules:
//   - Only manual-sourced sections qualify (page_ref present). Host-typed notes can
//     contain property-specific detail and never leave the property.
//   - Fire-and-forget. This runs after the property-level approval succeeds; a catalog
//     hiccup must never fail the host's approval.

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

export type CatalogKnowledgeKind = 'troubleshooting' | 'error_code' | 'usage' | 'care';

function classifyKind(title: string): CatalogKnowledgeKind {
  if (/error|code|fault/i.test(title)) return 'error_code';
  if (/troubleshoot|problem|not working|won't|leak|noise|reset/i.test(title)) return 'troubleshooting';
  if (/clean|care|maint|filter|descale/i.test(title)) return 'care';
  return 'usage';
}

/** OEM when the source host contains the brand name (whirlpool.com for Whirlpool); else aggregator. */
function sourceTierFor(sourceUrl: string, brand: string): 'oem' | 'aggregator' {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    const brandKey = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    return brandKey.length >= 3 && host.includes(brandKey) ? 'oem' : 'aggregator';
  } catch {
    return 'aggregator';
  }
}

export async function publishApprovedSectionToCatalog(
  admin: Admin,
  args: { catalogId: string; brand: string; sectionTitle: string; body: string; pageRef: string | null },
): Promise<void> {
  if (!args.pageRef) return;
  try {
    await admin.from('appliance_catalog_knowledge').upsert(
      {
        catalog_id: args.catalogId,
        kind: classifyKind(args.sectionTitle),
        question: args.sectionTitle.slice(0, 300),
        answer: args.body.slice(0, 8000),
        source_url: args.pageRef.slice(0, 2000),
        source_tier: sourceTierFor(args.pageRef, args.brand),
        content_hash: createHash('sha256').update(args.body).digest('hex'),
        verified_at: new Date().toISOString(),
      },
      { onConflict: 'catalog_id,content_hash', ignoreDuplicates: true },
    );
    // Lifecycle: a seed entry with real knowledge is active.
    await admin
      .from('appliance_catalog')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', args.catalogId)
      .eq('status', 'seed');
  } catch (e) {
    log.warn('catalog_publish_failed', { catalogId: args.catalogId, error: String(e) });
  }
}
