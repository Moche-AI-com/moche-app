import { NextResponse } from 'next/server';
import { getPropertyAccess } from '@/lib/auth/guards';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { ensureCatalogSeeded, searchCatalog } from '@/lib/appliances/catalog';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Typeahead over the shared appliance catalog (slice 4a). Read-only for hosts; the
 * catalog self-seeds on first use. The property guard keeps this a member-only
 * endpoint even though the catalog itself holds no tenant data.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getPropertyAccess((await params).id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!hasServiceRole()) return NextResponse.json({ error: 'Catalog unavailable.' }, { status: 503 });

  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    const admin = createAdminClient();
    await ensureCatalogSeeded(admin);
    const results = await searchCatalog(admin, q);
    return NextResponse.json({ results });
  } catch (e) {
    log.warn('appliance_catalog_search_failed', { error: String(e) });
    return NextResponse.json({ error: 'Search is unavailable right now.' }, { status: 500 });
  }
}
