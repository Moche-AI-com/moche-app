// Text chunking for embeddings. Splits on paragraph/sentence boundaries with a
// target size and small overlap so retrieved chunks keep local context.
// Pure + deterministic so it is unit-testable.

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  maxChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetChars: 900,
  overlapChars: 120,
  maxChars: 1400,
};

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const { targetChars, overlapChars, maxChars } = { ...DEFAULTS, ...opts };
  const text = input.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  // Split into paragraphs, then greedily pack into chunks near targetChars.
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of paras) {
    if (para.length > maxChars) {
      // Paragraph itself too large — split by sentences.
      flush();
      const sentences = para.split(/(?<=[.!?])\s+/);
      let buf = '';
      for (const s of sentences) {
        if ((buf + ' ' + s).length > targetChars && buf) {
          chunks.push(buf.trim());
          buf = buf.slice(Math.max(0, buf.length - overlapChars));
        }
        buf += (buf ? ' ' : '') + s;
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }
    if ((current + '\n\n' + para).length > targetChars && current) {
      flush();
    }
    current += (current ? '\n\n' : '') + para;
  }
  flush();

  return chunks.filter(Boolean);
}
