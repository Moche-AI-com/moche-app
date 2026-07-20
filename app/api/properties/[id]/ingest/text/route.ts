import { NextResponse } from 'next/server';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ingestTextSchema } from '@/lib/validation';
import { ingestText } from '@/lib/ingest/pipeline';
import { standardizeListing } from '@/lib/ingest/standardize';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paste / typed-text ingestion. The reliable path when a URL is blocked
// (e.g. Zillow) — the host copies the listing details in and we clean +
// structure them the same way we would a fetched page.
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
  const parsed = ingestTextSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { text, title, category, visibility, standardize } = parsed.data;

  const ctx = await getSessionContext();
  const supabase = createClient();

  // Optionally clean + structure the pasted content before embedding.
  const finalText = standardize ? (await standardizeListing(text)).text : text;

  try {
    const result = await ingestText(supabase, {
      propertyId: params.id,
      title: (title && title.trim()) || 'Pasted notes',
      text: finalText,
      category,
      visibility,
      sourceType: 'manual_entry',
      kind: 'document',
      createdBy: ctx?.user.id ?? null,
    });
    await audit(supabase, {
      action: 'brain.ingest.text',
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
