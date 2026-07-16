import 'server-only';

// Extracts plain text from an uploaded document buffer.
// Supported: PDF, DOCX, TXT, MD. Returns trimmed text (may be empty).
export async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();

  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    // Import the implementation file directly to avoid pdf-parse's index debug harness.
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (b: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return (data.text ?? '').trim();
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return (value ?? '').trim();
  }

  if (mimeType.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
    return buffer.toString('utf8').trim();
  }

  throw new Error('Unsupported file type. Upload a PDF, DOCX, TXT, or MD file.');
}
