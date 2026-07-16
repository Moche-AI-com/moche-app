declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
  }
  export default function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
}
