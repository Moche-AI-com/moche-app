import { NextResponse } from 'next/server';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractText } from '@/lib/ingest/extract';
import { createProposal } from '@/lib/brain/proposal-store';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { ensureIngestionSource, recordManualSource } from '@/lib/acquisition/audit';
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
  'transportation',
]);

/** Document content is untrusted reference data and always becomes a host-reviewed proposal. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getPropertyAccess((await params).id);
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
  const admin = createAdminClient();

  // 1. Upload the raw file to the private bucket at <property_id>/<uuid>-<name>.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const storagePath = `${(await params).id}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('property-documents')
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    log.warn('doc_upload_failed', { propertyId: (await params).id, error: upErr.message });
    return NextResponse.json({ error: 'Could not store the file.' }, { status: 500 });
  }

  // 2. Create the documents row.
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({
      property_id: (await params).id,
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

  const title = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) || 'Document';

  const sourceId = await ensureIngestionSource(admin, {
    propertyId: (await params).id, kind: 'document', documentId, profile: 'document_url_v1', label: title, createdBy: ctx?.user.id ?? null,
  });
  await recordManualSource(admin, { propertyId: (await params).id, sourceId, profile: 'document_url_v1', title, text, provider: 'uploaded-document' });

  // Imported document content always remains a host-reviewed proposal.
  try {
    const proposal = await createProposal(admin, {
      propertyId: (await params).id,
      hostAccountId: access.property.host_account_id,
      fieldPath: 'brain.document_summary',
      label: title,
      proposedValue: { title, text, category, visibility },
      sourceType: 'document',
      sourceRef: documentId,
      confidence: 0.4,
    });
    if (!proposal.ok) {
      await supabase.from('documents').update({ status: 'failed', error_detail: 'proposal_failed' } as never).eq('id', documentId);
      return NextResponse.json({ error: proposal.error }, { status: 500 });
    }
    await supabase.from('documents').update({ status: 'ready' } as never).eq('id', documentId);
    await audit(supabase, {
      action: 'brain.proposal.create',
      actorProfileId: ctx?.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId: (await params).id,
      targetType: 'proposed_update',
      targetId: proposal.id,
      metadata: { fieldPath: 'brain.document_summary', sourceRef: documentId },
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      proposalId: proposal.id,
      title,
      message: 'Your imported details are ready for you to review.',
    });
  } catch (e) {
    await supabase.from('documents').update({ status: 'failed', error_detail: 'ingest_failed' } as never).eq('id', documentId);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ingestion failed.' }, { status: 500 });
  }
}
