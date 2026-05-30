import { createSignal } from 'solid-js';
import type { KnowledgeBase, Document } from '@/types';

interface EmbeddingConfigInfo {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

interface KBState {
  knowledgeBases: KnowledgeBase[];
  currentKB: KnowledgeBase | null;
  documents: Document[];
  loading: boolean;
  uploading: boolean;
  embeddingConfig: EmbeddingConfigInfo | null;
}

const [kbState, setKBState] = createSignal<KBState>({
  knowledgeBases: [],
  currentKB: null,
  documents: [],
  loading: false,
  uploading: false,
  embeddingConfig: null,
});

export { kbState };

export async function fetchEmbeddingConfig(): Promise<void> {
  try {
    const config = (await window.electronAPI.kb.getEmbeddingConfig()) as EmbeddingConfigInfo | null;
    setKBState((prev) => ({ ...prev, embeddingConfig: config }));
  } catch (err) {
    console.error('Failed to fetch embedding config:', err);
  }
}

export async function saveEmbeddingConfig(baseUrl: string, apiKey: string, model: string): Promise<void> {
  try {
    await window.electronAPI.kb.saveEmbeddingConfig({ baseUrl, apiKey, model });
    await fetchEmbeddingConfig();
  } catch (err) {
    console.error('Failed to save embedding config:', err);
    throw err;
  }
}

export async function fetchKnowledgeBases(): Promise<void> {
  setKBState((prev) => ({ ...prev, loading: true }));
  try {
    const kbs = (await window.electronAPI.kb.list()) as KnowledgeBase[];
    setKBState((prev) => ({ ...prev, knowledgeBases: kbs, loading: false }));
  } catch (err) {
    console.error('Failed to fetch knowledge bases:', err);
    setKBState((prev) => ({ ...prev, loading: false }));
  }
}

export async function createKnowledgeBase(name: string, description?: string): Promise<void> {
  try {
    await window.electronAPI.kb.create(name, description);
    await fetchKnowledgeBases();
  } catch (err) {
    console.error('Failed to create knowledge base:', err);
    throw err;
  }
}

export async function deleteKnowledgeBase(id: number): Promise<void> {
  try {
    await window.electronAPI.kb.delete(id);
    setKBState((prev) => ({
      ...prev,
      knowledgeBases: prev.knowledgeBases.filter((kb) => kb.id !== id),
      currentKB: prev.currentKB?.id === id ? null : prev.currentKB,
      documents: prev.currentKB?.id === id ? [] : prev.documents,
    }));
  } catch (err) {
    console.error('Failed to delete knowledge base:', err);
    throw err;
  }
}

export async function selectKnowledgeBase(kb: KnowledgeBase): Promise<void> {
  setKBState((prev) => ({ ...prev, currentKB: kb, loading: true }));
  try {
    const docs = (await window.electronAPI.kb.listDocuments(kb.id)) as Document[];
    setKBState((prev) => ({ ...prev, documents: docs, loading: false }));
  } catch (err) {
    console.error('Failed to fetch documents:', err);
    setKBState((prev) => ({ ...prev, loading: false }));
  }
}

export async function uploadDocuments(kbId: number, files: Array<{ filepath: string; filename: string; file_type: string; file_size: number }>): Promise<void> {
  setKBState((prev) => ({ ...prev, uploading: true }));
  try {
    for (const file of files) {
      await window.electronAPI.kb.uploadDocument({
        kb_id: kbId,
        ...file,
      });
    }
    const kb = kbState().currentKB;
    if (kb && kb.id === kbId) {
      await selectKnowledgeBase(kb);
    }
    await fetchKnowledgeBases();
  } catch (err) {
    console.error('Failed to upload documents:', err);
    throw err;
  } finally {
    setKBState((prev) => ({ ...prev, uploading: false }));
  }
}

export async function deleteDocument(id: number): Promise<void> {
  try {
    await window.electronAPI.kb.deleteDocument(id);
    setKBState((prev) => ({
      ...prev,
      documents: prev.documents.filter((d) => d.id !== id),
    }));
    await fetchKnowledgeBases();
  } catch (err) {
    console.error('Failed to delete document:', err);
    throw err;
  }
}

export async function retryDocument(docId: number): Promise<void> {
  setKBState((prev) => ({ ...prev, uploading: true }));
  try {
    await window.electronAPI.kb.retryDocument(docId);
    const kb = kbState().currentKB;
    if (kb) {
      await selectKnowledgeBase(kb);
    }
    await fetchKnowledgeBases();
  } catch (err) {
    console.error('Failed to retry document:', err);
    throw err;
  } finally {
    setKBState((prev) => ({ ...prev, uploading: false }));
  }
}

export async function openFilePicker(): Promise<Array<{ filepath: string; filename: string; file_type: string; file_size: number }> | null> {
  try {
    return (await window.electronAPI.kb.openFileDialog()) as Array<{ filepath: string; filename: string; file_type: string; file_size: number }> | null;
  } catch (err) {
    console.error('Failed to open file dialog:', err);
    return null;
  }
}

export interface RAGSource {
  index: number;
  chunk_id: number;
  doc_id: number;
  doc_filename: string;
  doc_filepath: string;
  chunk_content: string;
}

export async function queryKnowledgeBase(kbId: number, query: string, topK?: number): Promise<{ chunks: unknown[]; context: string; sources: RAGSource[] }> {
  try {
    return (await window.electronAPI.kb.query({ kb_id: kbId, query, top_k: topK })) as { chunks: unknown[]; context: string; sources: RAGSource[] };
  } catch (err) {
    console.error('Failed to query knowledge base:', err);
    throw err;
  }
}
