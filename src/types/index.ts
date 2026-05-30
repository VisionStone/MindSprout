// ============================================================
// MindSprout — Shared TypeScript Types
// ============================================================

export type Visibility = 'public' | 'private';
export type LayoutMode = 'hierarchical' | 'radial' | 'force';
export type NodeType = 'root' | 'branch' | 'leaf';
export type EdgeType = 'parent_child' | 'cross_link';
export type TaskType = 'generate' | 'expand' | 'enrich';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped' | 'restarting';
export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'local' | 'custom';
export type Theme = 'light' | 'dark' | 'system';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface NodeStyle {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  fontSize?: number;
  shape?: 'rectangle' | 'rounded' | 'ellipse' | 'pill';
}

export interface EdgeStyle {
  color?: string;
  width?: number;
  dash?: boolean;
}

export interface Mindmap {
  id: number;
  title: string;
  description: string;
  visibility: Visibility;
  layout_mode: LayoutMode;
  view_state: string; // JSON-encoded ViewState
  created_at: string;
  updated_at: string;
  version: number;
}

export interface Node {
  id: number;
  mindmap_id: number;
  parent_id: number | null;
  node_type: NodeType;
  title: string;
  content: string;
  description: string;
  source_doc: string;
  source_chunk: string;
  style: string; // JSON-encoded NodeStyle
  pos_x: number;
  pos_y: number;
  level: number;
  sort_order: number;
  collapsed: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface Edge {
  id: number;
  mindmap_id: number;
  source_node_id: number;
  target_node_id: number;
  edge_type: EdgeType;
  style: string; // JSON-encoded EdgeStyle
  created_at: string;
}

export interface Task {
  id: number;
  task_type: TaskType;
  status: TaskStatus;
  progress: number; // 0–100
  input_params: string; // JSON-encoded object
  result: string; // JSON-encoded result or empty
  error_message: string;
  mindmap_id: number | null;
  node_id: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AIProviderConfig {
  id: number;
  display_name: string;
  provider_type: AIProviderType;
  api_key: string;
  base_url: string;
  model_id: string;
  temperature: number;
  max_tokens: number;
  is_default: number; // 0 or 1
  created_at: string;
}

export interface AppSettings {
  theme: Theme;
  auto_save_interval: number; // seconds, 0 = disabled
  default_zoom: number;
  default_layout_mode: LayoutMode;
}

export type KBStatus = 'pending' | 'indexing' | 'ready' | 'error';

export interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  doc_count: number;
  chunk_count: number;
  embedding_model: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: number;
  kb_id: number;
  filename: string;
  file_type: string;
  file_size: number;
  content_hash: string;
  status: KBStatus;
  chunk_count: number;
  error_message: string;
  created_at: string;
}

export interface DocumentChunk {
  id: number;
  doc_id: number;
  chunk_index: number;
  content: string;
  token_count: number;
  created_at: string;
}

// ============================================================
// IPC payload / DTO types
// ============================================================

export interface CreateMindmapInput {
  title: string;
  description?: string;
  visibility?: Visibility;
  layout_mode?: LayoutMode;
}

export interface UpdateMindmapInput {
  id: number;
  title?: string;
  description?: string;
  visibility?: Visibility;
  layout_mode?: LayoutMode;
  view_state?: ViewState;
}

export interface CreateNodeInput {
  mindmap_id: number;
  parent_id: number | null;
  node_type?: NodeType;
  title: string;
  content?: string;
  description?: string;
  source_doc?: string;
  source_chunk?: string;
  style?: NodeStyle;
  pos_x?: number;
  pos_y?: number;
  level?: number;
  sort_order?: number;
  collapsed?: boolean;
}

export interface UpdateNodeInput {
  id: number;
  parent_id?: number | null;
  node_type?: NodeType;
  title?: string;
  content?: string;
  description?: string;
  source_doc?: string;
  source_chunk?: string;
  style?: NodeStyle;
  pos_x?: number;
  pos_y?: number;
  level?: number;
  sort_order?: number;
  collapsed?: boolean;
}

export interface CreateEdgeInput {
  mindmap_id: number;
  source_node_id: number;
  target_node_id: number;
  edge_type?: EdgeType;
  style?: EdgeStyle;
}

export interface StartTaskInput {
  task_type: TaskType;
  mindmap_id: number;
  node_id?: number;
  prompt?: string;
  provider_id?: number;
  ragContext?: string;
}

export interface SaveProviderInput {
  id?: number;
  display_name: string;
  provider_type: AIProviderType;
  api_key: string;
  base_url?: string;
  model_id: string;
  temperature?: number;
  max_tokens?: number;
  is_default?: boolean;
}

export interface CreateKBInput {
  name: string;
  description?: string;
}

export interface UploadDocumentInput {
  kb_id: number;
  filepath: string;
  filename: string;
  file_type: string;
  file_size: number;
}

export interface RAGQueryInput {
  kb_id: number;
  query: string;
  top_k?: number;
}

// ============================================================
// Knowledge Base types
// ============================================================

export type DocumentStatus = 'indexing' | 'ready' | 'error';

export interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  doc_count: number;
  chunk_count: number;
  embedding_model: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: number;
  kb_id: number;
  filename: string;
  file_type: string;
  file_size: number;
  content_hash: string;
  status: DocumentStatus;
  chunk_count: number;
  error_message: string;
  created_at: string;
}

export interface DocumentChunk {
  id: number;
  doc_id: number;
  chunk_index: number;
  content: string;
  token_count: number;
  created_at: string;
}
