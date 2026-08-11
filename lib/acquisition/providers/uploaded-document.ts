import 'server-only';
import type { Database } from '@/lib/database.types';
import { getObjectBytes } from '@/lib/storage/s3';
import { extractText } from '@/lib/ingest/extract';
import type { AcquisitionResult } from '../types';
import type { AcquisitionProfile } from '../profiles';

type StoredDocument = Pick<Database['public']['Tables']['documents']['Row'], 'id' | 'file_name' | 'storage_path' | 'mime_type'>;

/** Reads an already-authorized private document into the common acquisition result shape. */
export async function acquireUploadedDocument(document: StoredDocument, profile: AcquisitionProfile): Promise<AcquisitionResult> {
  const object = await getObjectBytes(document.storage_path);
  if (!object) throw new Error('The uploaded document is no longer available.');
  const text = (await extractText(object.body, document.mime_type, document.file_name)).slice(0, profile.maxBytes);
  return {
    title: document.file_name.replace(/\.[^.]+$/, '') || 'Document', text,
    sourceUrl: `document://${document.id}`, finalUrl: `document://${document.id}`,
    contentType: document.mime_type, byteLength: object.body.byteLength, providerName: 'uploaded-document', httpStatus: 200,
    truncated: text.length >= profile.maxBytes,
  };
}
