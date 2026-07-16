import { NextResponse } from 'next/server';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { extractText } from '@/lib/ingest/extract';
import { ingestText } from '@/lib/ingest/pipeline';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Database } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);
const VALID_CATEGORIES = new Set<Database['public']['Enums']['brain_category']>([
  'core', 'appliances', 'house_rules', 'checkin_checkout', 'local_recommendations',
  'emergency', 'documents', 'product_urls', 'host_qa', 'internal_notes',
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getPropertyAccess(params.id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!access.can.editBrain) return NextResponse.json({ error: 'You cannot edit this Brain.' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  const file = form.get('file');
  const categoryRaw = String(form.get('category') ?? 'documents') as Database['public']['Enums']['brain_category'];
  const category = VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : 'documents';
  const visibility = category === 'internal_notes' ? 'internal' : 'guest';

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds the 25 MB limit.' }, { status: 400 });
  const mime = file.type || 'application/octet-stream';
  const lower = file.name.toLowerCase();
  const looksAllowed = ALLOWED.has(mime) || /\.(pdf|docx|txt|md|markdown)$/.test(lower);
  if (!looksAllowed) return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ctx = await getSessionContext();
  const supabase = createClient();

  // 1. Upload the raw file to the private bucket at <property_id>/<uuid>-<name>.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const storagePath = `${params.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('property-documents')
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    log.warn('doc_upload_failed', { propertyId: params.id, error: upErr.message });
    return NextResponse.json({ error: 'Could not store the file.' }, { status: 500 });
  }

  // 2. Create the documents row.
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      property_id: params.id,
      file_name: file.name.slice(0, 200),
      mime_type: mime,
      size_bytes: file.size,
      storage_path: storagePath,
      status: 'processing',
      visibility,
      uploaded_by: ctx?.user.id ?? null,
    } as never)
    .select('id')
    .single();
  if (docErr || !doc) {
    await supabase.storage.from('property-documents').remove([storagePath]);
    return NextResponse.json({ error: 'Could not record the document.' }, { status: 500 });
  }
  const documentId = (doc as { id: string }).id;

  // 3. Extract text.
  let text: string;
  try {
    text = await extractText(buffer, mime, file.name);
  } catch (e) {
    await supabase.from('documents').update({ status: 'failed', error_detail: 'extract_failed' } as never).eq('id', documentId);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read that file.' }, { status: 400 });
  }
  if (text.length < 20) {
    await supabase.from('documents').update({ status: 'failed', error_detail: 'empty' } as never).eq('id', documentId);
    return NextResponse.json({ error: 'No readable text was found in that document.' }, { status: 400 });
  }

  // 4. Run the shared ingestion pipeline (chunk -> embed -> chunks).
  try {
    const title = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) || 'Document';
    const result = await ingestText(supabase, {
      propertyId: params.id,
      title,
      text,
      category,
      visibility,
      sourceType: 'document',
      kind: 'document',
      documentId,
      createdBy: ctx?.user.id ?? null,
    });
    await supabase.from('documents').update({ status: 'ready', brain_item_id: result.brainItemId } as never).eq('id', documentId);
    await audit(supabase, {
      action: 'brain.ingest.document',
      actorProfileId: ctx?.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId: params.id,
      targetType: 'document',
      targetId: documentId,
    });
    return NextResponse.json({ ok: true, title: result.title, chunks: result.chunks });
  } catch (e) {
    await supabase.from('documents').update({ status: 'failed', error_detail: 'ingest_failed' } as never).eq('id', documentId);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ingestion failed.' }, { status: 500 });
  }
}
