import { NextResponse } from 'next/server';
import { getPropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/guards';
import { ingestUrlSchema } from '@/lib/validation';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { ingestText } from '@/lib/ingest/pipeline';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getPropertyAccess(params.id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!access.can.editBrain) return NextResponse.json({ error: 'You cannot edit this Brain.' }, { status: 403 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = ingestUrlSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { url, title, category, visibility } = parsed.data;

  // Fetch through the SSRF-guarded, server-only boundary. Content is untrusted reference data.
  let page;
  try {
    page = await fetchUrlContent(url);
  } catch (e) {
    if (isSsrfError(e)) {
      log.warn('ingest_url_blocked', { propertyId: params.id, reason: e.message });
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : 'Could not fetch that URL.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const ctx = await getSessionContext();
  const supabase = createClient();

  try {
    const result = await ingestText(supabase, {
      propertyId: params.id,
      title: (title && title.trim()) || page.title || url,
      text: page.text,
      category,
      visibility,
      sourceType: 'url',
      kind: 'url',
      sourceUrl: page.sourceUrl,
      createdBy: ctx?.user.id ?? null,
    });
    await audit(supabase, {
      action: 'brain.ingest.url',
      actorProfileId: ctx?.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId: params.id,
      targetType: 'brain_item',
      targetId: result.brainItemId,
    });
    return NextResponse.json({ ok: true, title: result.title, chunks: result.chunks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ingestion failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
