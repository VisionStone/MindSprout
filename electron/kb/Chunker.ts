export interface Chunk {
  content: string;
  tokenCount: number;
}

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;
const MAX_CHUNKS = 500;

export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP
): Chunk[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: Chunk[] = [];
  const totalLength = text.length;
  let start = 0;

  while (start < totalLength && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + chunkSize, totalLength);

    if (end < totalLength) {
      let breakPoint = -1;
      const searchStart = Math.max(start + Math.floor(chunkSize * 0.5), start);
      for (let i = end; i > searchStart; i--) {
        const ch = text.charAt(i);
        if (ch === '\n' || ch === '。' || ch === '.' || ch === '！' || ch === '？') {
          breakPoint = i + 1;
          break;
        }
      }
      if (breakPoint > start) {
        end = breakPoint;
      }
    }

    const content = text.substring(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        content,
        tokenCount: Math.ceil(content.length / 2),
      });
    }

    const nextStart = end - overlap;
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}
