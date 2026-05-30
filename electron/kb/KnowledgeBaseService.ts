import { createHash } from 'crypto';
import log from 'electron-log';
import { getDb } from '../db';
import { parseDocument } from './DocumentParser';
import { chunkText } from './Chunker';
import { EmbeddingService } from './EmbeddingService';
import type { EmbeddingConfig } from './EmbeddingService';
import type { KnowledgeBase, Document, DocumentChunk } from '../../src/types';

function toISOString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function rowToKB(row: Record<string, unknown>): KnowledgeBase {
  return {
    id: row.id as number,
    name: row.name as string,
    description: row.description as string,
    doc_count: row.doc_count as number,
    chunk_count: row.chunk_count as number,
    embedding_model: row.embedding_model as string,
    created_at: toISOString(row.created_at as number),
    updated_at: toISOString(row.updated_at as number),
  };
}

function rowToDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as number,
    kb_id: row.kb_id as number,
    filename: row.filename as string,
    file_type: row.file_type as string,
    file_size: row.file_size as number,
    content_hash: row.content_hash as string,
    status: row.status as Document['status'],
    chunk_count: row.chunk_count as number,
    error_message: row.error_message as string,
    created_at: toISOString(row.created_at as number),
  };
}

export class KnowledgeBaseService {
  private embeddingService = new EmbeddingService();

  getEmbeddingConfig(): EmbeddingConfig | null {
    const db = getDb();
    const baseUrlRow = db
      .prepare("SELECT value FROM app_settings WHERE key = 'embedding_base_url'")
      .get() as { value: string } | undefined;
    const apiKeyRow = db
      .prepare("SELECT value FROM app_settings WHERE key = 'embedding_api_key'")
      .get() as { value: string } | undefined;
    const modelRow = db
      .prepare("SELECT value FROM app_settings WHERE key = 'embedding_model'")
      .get() as { value: string } | undefined;

    if (!baseUrlRow || !apiKeyRow) return null;

    let apiKey: string;
    try {
      const raw = JSON.parse(apiKeyRow.value) as string;
      const { safeStorage } = require('electron');
      const encrypted = Buffer.from(raw, 'base64');
      apiKey = safeStorage.decryptString(encrypted);
    } catch {
      apiKey = JSON.parse(apiKeyRow.value) as string;
    }

    return {
      baseUrl: JSON.parse(baseUrlRow.value) as string,
      apiKey,
      model: modelRow ? (JSON.parse(modelRow.value) as string) : 'text-embedding-3-small',
    };
  }

  saveEmbeddingConfig(config: EmbeddingConfig): void {
    const db = getDb();
    let apiKeyToStore: string;
    try {
      const { safeStorage } = require('electron');
      const encrypted = safeStorage.encryptString(config.apiKey);
      apiKeyToStore = Buffer.from(encrypted).toString('base64');
    } catch {
      apiKeyToStore = config.apiKey;
    }
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('embedding_base_url', ?)")
      .run(JSON.stringify(config.baseUrl));
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('embedding_api_key', ?)")
      .run(JSON.stringify(apiKeyToStore));
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('embedding_model', ?)")
      .run(JSON.stringify(config.model));
  }

  listKnowledgeBases(): KnowledgeBase[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM knowledge_bases ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(rowToKB);
  }

  createKnowledgeBase(name: string, description: string = ''): KnowledgeBase {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const embeddingConfig = this.getEmbeddingConfig();
    const result = db
      .prepare(
        `INSERT INTO knowledge_bases (name, description, doc_count, chunk_count, embedding_model, created_at, updated_at)
         VALUES (?, ?, 0, 0, ?, ?, ?)`
      )
      .run(name, description, embeddingConfig?.model ?? '', now, now);
    return this.getKnowledgeBase(result.lastInsertRowid as number)!;
  }

  getKnowledgeBase(id: number): KnowledgeBase | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToKB(row) : null;
  }

  deleteKnowledgeBase(id: number): void {
    const db = getDb();
    const chunks = db
      .prepare(
        `SELECT dc.id FROM document_chunks dc
         JOIN documents d ON dc.doc_id = d.id
         WHERE d.kb_id = ?`
      )
      .all(id) as Record<string, unknown>[];
    for (const chunk of chunks) {
      db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?').run(chunk.id);
    }
    db.prepare('DELETE FROM documents WHERE kb_id = ?').run(id);
    db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id);
  }

  listDocuments(kbId: number): Document[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM documents WHERE kb_id = ? ORDER BY created_at DESC')
      .all(kbId) as Record<string, unknown>[];
    return rows.map(rowToDocument);
  }

  async uploadDocument(
    kbId: number,
    filepath: string,
    filename: string,
    fileType: string,
    fileSize: number,
    embeddingConfig: EmbeddingConfig
  ): Promise<Document> {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    const fileBuffer = require('fs').readFileSync(filepath);
    const contentHash = createHash('sha256').update(fileBuffer).digest('hex');

    const existing = db
      .prepare('SELECT id FROM documents WHERE kb_id = ? AND content_hash = ?')
      .get(kbId, contentHash) as Record<string, unknown> | undefined;
    if (existing) {
      throw new Error('该文件已存在于知识库中');
    }

    const result = db
      .prepare(
        `INSERT INTO documents (kb_id, filename, filepath, file_type, file_size, content_hash, status, chunk_count, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'indexing', 0, '', ?)`
      )
      .run(kbId, filename, filepath, fileType, fileSize, contentHash, now);

    const docId = result.lastInsertRowid as number;

    try {
      const parsed = await parseDocument(filepath, fileType);
      const truncatedText = parsed.text.length > 500000 ? parsed.text.substring(0, 500000) : parsed.text;
      const chunks = chunkText(truncatedText);

      const embeddings = await this.embeddingService.embed(
        chunks.map(c => c.content),
        embeddingConfig
      );

      const insertChunk = db.prepare(
        `INSERT INTO document_chunks (doc_id, chunk_index, content, token_count, created_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      const insertEmbedding = db.prepare(
        `INSERT INTO chunk_embeddings (chunk_id, embedding, created_at)
         VALUES (?, ?, ?)`
      );

      const insertAll = db.transaction(() => {
        for (let i = 0; i < chunks.length; i++) {
          const chunkResult = insertChunk.run(docId, i, chunks[i].content, chunks[i].tokenCount, now);
          const chunkId = chunkResult.lastInsertRowid as number;
          insertEmbedding.run(chunkId, JSON.stringify(embeddings[i]), now);
        }
      });
      insertAll();

      db.prepare(
        `UPDATE documents SET status = 'ready', chunk_count = ? WHERE id = ?`
      ).run(chunks.length, docId);

      db.prepare(
        `UPDATE knowledge_bases SET doc_count = doc_count + 1, chunk_count = chunk_count + ?, embedding_model = ?, updated_at = ? WHERE id = ?`
      ).run(chunks.length, embeddingConfig.model, now, kbId);

      return this.getDocument(docId)!;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('[KB] Document indexing failed:', errorMessage);
      db.prepare(
        `UPDATE documents SET status = 'error', error_message = ? WHERE id = ?`
      ).run(errorMessage, docId);
      throw err;
    }
  }

  async retryDocument(
    docId: number,
    embeddingConfig: EmbeddingConfig
  ): Promise<Document> {
    const db = getDb();
    const doc = this.getDocument(docId);
    if (!doc) throw new Error('Document not found');

    const filepath = (db
      .prepare('SELECT filepath FROM documents WHERE id = ?')
      .get(docId) as Record<string, unknown> | undefined)?.filepath as string;
    if (!filepath) throw new Error('Original file path not found, please re-upload the document');

    const chunks = db
      .prepare('SELECT id FROM document_chunks WHERE doc_id = ?')
      .all(docId) as Record<string, unknown>[];
    for (const chunk of chunks) {
      db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?').run(chunk.id);
    }
    db.prepare('DELETE FROM document_chunks WHERE doc_id = ?').run(docId);

    const kbBefore = this.getKnowledgeBase(doc.kb_id);
    const prevChunkCount = kbBefore ? kbBefore.chunk_count - chunks.length : 0;

    db.prepare(
      `UPDATE documents SET status = 'indexing', error_message = '', chunk_count = 0 WHERE id = ?`
    ).run(docId);
    db.prepare(
      `UPDATE knowledge_bases SET chunk_count = ? WHERE id = ?`
    ).run(Math.max(0, prevChunkCount), doc.kb_id);

    try {
      const parsed = await parseDocument(filepath, doc.file_type);
      const truncatedText = parsed.text.length > 500000 ? parsed.text.substring(0, 500000) : parsed.text;
      const newChunks = chunkText(truncatedText);

      const embeddings = await this.embeddingService.embed(
        newChunks.map(c => c.content),
        embeddingConfig
      );

      const now = Math.floor(Date.now() / 1000);
      const insertChunk = db.prepare(
        `INSERT INTO document_chunks (doc_id, chunk_index, content, token_count, created_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      const insertEmbedding = db.prepare(
        `INSERT INTO chunk_embeddings (chunk_id, embedding, created_at)
         VALUES (?, ?, ?)`
      );

      const insertAll = db.transaction(() => {
        for (let i = 0; i < newChunks.length; i++) {
          const chunkResult = insertChunk.run(docId, i, newChunks[i].content, newChunks[i].tokenCount, now);
          const chunkId = chunkResult.lastInsertRowid as number;
          insertEmbedding.run(chunkId, JSON.stringify(embeddings[i]), now);
        }
      });
      insertAll();

      db.prepare(
        `UPDATE documents SET status = 'ready', chunk_count = ? WHERE id = ?`
      ).run(newChunks.length, docId);

      db.prepare(
        `UPDATE knowledge_bases SET chunk_count = ? + ?, updated_at = ? WHERE id = ?`
      ).run(Math.max(0, prevChunkCount), newChunks.length, now, doc.kb_id);

      return this.getDocument(docId)!;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error('[KB] Document retry failed:', errorMessage);
      db.prepare(
        `UPDATE documents SET status = 'error', error_message = ? WHERE id = ?`
      ).run(errorMessage, docId);
      throw err;
    }
  }

  getDocument(id: number): Document | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM documents WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToDocument(row) : null;
  }

  deleteDocument(id: number): void {
    const db = getDb();
    const doc = this.getDocument(id);
    if (!doc) return;

    const chunks = db
      .prepare('SELECT id FROM document_chunks WHERE doc_id = ?')
      .all(id) as Record<string, unknown>[];

    for (const chunk of chunks) {
      db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?').run(chunk.id);
    }
    db.prepare('DELETE FROM document_chunks WHERE doc_id = ?').run(id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE knowledge_bases SET doc_count = MAX(0, doc_count - 1), chunk_count = MAX(0, chunk_count - ?), updated_at = ? WHERE id = ?`
    ).run(chunks.length, now, doc.kb_id);
  }

  search(kbId: number, queryEmbedding: number[], topK: number = 5): DocumentChunk[] {
    const db = getDb();

    const docIds = db
      .prepare('SELECT id FROM documents WHERE kb_id = ? AND status = ?')
      .all(kbId, 'ready') as Record<string, unknown>[];
    if (docIds.length === 0) return [];

    const docIdList = docIds.map(d => d.id as number);
    const placeholders = docIdList.map(() => '?').join(',');

    const rows = db
      .prepare(
        `SELECT dc.*, ce.embedding
         FROM document_chunks dc
         JOIN chunk_embeddings ce ON dc.id = ce.chunk_id
         JOIN documents d ON dc.doc_id = d.id
         WHERE dc.doc_id IN (${placeholders})`
      )
      .all(...docIdList) as Record<string, unknown>[];

    const scored = rows.map(row => {
      const embedding = JSON.parse(row.embedding as string) as number[];
      const score = cosineSimilarity(queryEmbedding, embedding);
      return { row, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);

    return topResults.map(({ row }) => ({
      id: row.id as number,
      doc_id: row.doc_id as number,
      chunk_index: row.chunk_index as number,
      content: row.content as string,
      token_count: row.token_count as number,
      created_at: toISOString(row.created_at as number),
    }));
  }

  async query(
    kbId: number,
    query: string,
    embeddingConfig: EmbeddingConfig,
    topK: number = 5
  ): Promise<{ chunks: DocumentChunk[]; context: string; sources: Array<{ index: number; chunk_id: number; doc_id: number; doc_filename: string; doc_filepath: string; chunk_content: string }> }> {
    const queryEmbeddings = await this.embeddingService.embed([query], embeddingConfig);
    const queryEmbedding = queryEmbeddings[0];

    const chunks = this.search(kbId, queryEmbedding, topK);
    const context = chunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n');

    const db = getDb();
    const sources = chunks.map((c, i) => {
      const doc = db
        .prepare('SELECT filename, filepath FROM documents WHERE id = ?')
        .get(c.doc_id) as Record<string, unknown> | undefined;
      return {
        index: i + 1,
        chunk_id: c.id,
        doc_id: c.doc_id,
        doc_filename: (doc?.filename ?? 'unknown') as string,
        doc_filepath: (doc?.filepath ?? '') as string,
        chunk_content: c.content,
      };
    });

    return { chunks, context, sources };
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
