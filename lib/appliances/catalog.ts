import 'server-only';

// Shared appliance catalog helpers (Manage Brain redesign, slice 4a; decision D1).
//
// The catalog self-provisions: the first search on an empty catalog bulk-upserts the
// bundled seed dataset (idempotent on normalized_key), so there is no ops step and no
// crawl needed to make typeahead useful. Knowledge rows populate lazily per model in
// slice 4b — never per property, so repeated models across hosts cost a SELECT.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import seed from './catalog-seed.json';

type Admin = SupabaseClient<Database>;

export interface CatalogEntry {
  id: string;
  category: string;
  brand: string;
  model: string;
  modelAliases: string[];
  oemSupportUrl: string | null;
  timesAdded: number;
  status: string;
  /** How many normalized knowledge rows the catalog holds for this model (0 in 4a). */
  knowledgeCount: number;
}

interface SeedRow {
  category: string;
  brand: string;
  model: string;
  aliases?: string[];
}

/** Canonical dedupe key: casefolded brand + whitespace-free model. */
export function normalizeApplianceKey(brand: string | null | undefined, model: string): string {
  return `${(brand ?? '').trim().toLowerCase()}:${model.trim().toLowerCase().replace(/\s+/g, '')}`;
}

export async function ensureCatalogSeeded(admin: Admin): Promise<void> {
  const { count } = await admin.from('appliance_catalog').select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return;
  const rows = (seed as SeedRow[]).map((s) => ({
    category: s.category,
    brand: s.brand,
    model: s.model,
    model_aliases: s.aliases ?? [],
    normalized_key: normalizeApplianceKey(s.brand, s.model),
    status: 'seed',
  }));
  await admin.from('appliance_catalog').upsert(rows, { onConflict: 'normalized_key', ignoreDuplicates: true });
}

/**
 * Tokenized brand/model search. Each token must hit brand or model (AND across tokens,
 * OR across the two columns), so "whirlpool wtw5000" works. PostgREST filter
 * metacharacters are stripped from the query before it ever reaches .or().
 */
export async function searchCatalog(admin: Admin, query: string, limit = 8): Promise<CatalogEntry[]> {
  const safe = query.replace(/[%_,"()\\.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (safe.length < 2) return [];

  let q = admin
    .from('appliance_catalog')
    .select('id, category, brand, model, model_aliases, oem_support_url, times_added, status');
  for (const token of safe.split(' ').slice(0, 3)) {
    q = q.or(`brand.ilike.%${token}%,model.ilike.%${token}%`);
  }
  const { data } = await q.order('times_added', { ascending: false }).limit(30);

  const needle = safe.toLowerCase();
  const ranked = (data ?? [])
    .map((row) => {
      const model = row.model.toLowerCase();
      const brand = row.brand.toLowerCase();
      let score = 0;
      if (model === needle) score += 100;
      if (model.startsWith(needle)) score += 50;
      if (model.includes(needle)) score += 25;
      if (row.model_aliases.some((a) => a.toLowerCase() === needle)) score += 40;
      if (brand.startsWith(needle)) score += 15;
      if (brand.includes(needle)) score += 8;
      return { row, score: score + Math.min(row.times_added, 10) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);

  const counts = new Map<string, number>();
  if (ranked.length > 0) {
    const { data: knowledge } = await admin
      .from('appliance_catalog_knowledge')
      .select('catalog_id')
      .in('catalog_id', ranked.map((r) => r.id));
    for (const k of knowledge ?? []) counts.set(k.catalog_id, (counts.get(k.catalog_id) ?? 0) + 1);
  }

  return ranked.map((row) => ({
    id: row.id,
    category: row.category,
    brand: row.brand,
    model: row.model,
    modelAliases: row.model_aliases,
    oemSupportUrl: row.oem_support_url,
    timesAdded: row.times_added,
    status: row.status,
    knowledgeCount: counts.get(row.id) ?? 0,
  }));
}
