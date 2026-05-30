import { readFileSync } from 'fs';
import log from 'electron-log';

export interface ParsedDocument {
  text: string;
  pageCount: number;
}

export async function parseDocument(filepath: string, fileType: string): Promise<ParsedDocument> {
  switch (fileType) {
    case 'txt':
    case 'md':
      return parsePlainText(filepath);
    case 'pdf':
      return parsePDF(filepath);
    case 'docx':
      return parseDocx(filepath);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

function parsePlainText(filepath: string): ParsedDocument {
  const text = readFileSync(filepath, 'utf-8');
  return { text, pageCount: 1 };
}

async function parsePDF(filepath: string): Promise<ParsedDocument> {
  try {
    const { PDFParse } = require('pdf-parse');
    const buffer = readFileSync(filepath);
    const parser = new PDFParse(new Uint8Array(buffer));
    const result = await parser.getText();
    const text = (result.text || '').trim();
    if (!text || text.length < 50) {
      log.warn('[DocumentParser] PDF text extraction yielded little content, file may be image-based');
      const info = await parser.getInfo().catch(() => null);
      const pages = info?.pages || 1;
      return { text: `[PDF file - text extraction limited. Pages: ${pages}]`, pageCount: pages };
    }
    const info = await parser.getInfo().catch(() => null);
    return { text, pageCount: info?.pages || 1 };
  } catch (err) {
    log.error('[DocumentParser] PDF parse error:', err);
    throw new Error(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function parseDocx(filepath: string): Promise<ParsedDocument> {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filepath });
    const text = result.value.trim();
    if (!text) {
      log.warn('[DocumentParser] DOCX text extraction yielded no content');
      return { text: '[DOCX file - text extraction limited]', pageCount: 1 };
    }
    return { text, pageCount: 1 };
  } catch (err) {
    log.error('[DocumentParser] DOCX parse error:', err);
    throw new Error(`Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`);
  }
}
