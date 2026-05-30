// ============================================================
// MindSprout — SQLite Schema
// Matches the design document schema for all core tables.
// ============================================================

export const SCHEMA_SQL = `
-- Mindmaps (思维导图)
CREATE TABLE IF NOT EXISTS mindmaps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    visibility      TEXT DEFAULT 'private' CHECK(visibility IN ('public','private')),
    layout_mode     TEXT DEFAULT 'hierarchical' CHECK(layout_mode IN ('hierarchical','radial','force')),
    view_state      TEXT DEFAULT '{"zoom":1,"panX":0,"panY":0}',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    version         INTEGER DEFAULT 1
);

-- Nodes (节点)
CREATE TABLE IF NOT EXISTS nodes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mindmap_id      INTEGER NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    parent_id       INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    node_type       TEXT DEFAULT 'branch' CHECK(node_type IN ('root','branch','leaf')),
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT DEFAULT '',
    description     TEXT DEFAULT '',
    source_doc      TEXT DEFAULT '',
    source_chunk    TEXT DEFAULT '',
    style           TEXT DEFAULT '{}',
    pos_x           REAL DEFAULT 0,
    pos_y           REAL DEFAULT 0,
    level           INTEGER DEFAULT 0,
    sort_order      INTEGER DEFAULT 0,
    collapsed       INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- Edges (连线)
CREATE TABLE IF NOT EXISTS edges (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mindmap_id      INTEGER NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    source_node_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type       TEXT DEFAULT 'parent_child' CHECK(edge_type IN ('parent_child','cross_link')),
    style           TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL
);

-- Tasks (AI 任务)
CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type       TEXT NOT NULL CHECK(task_type IN ('generate','expand','enrich')),
    status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','stopped','restarting')),
    progress        INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    input_params    TEXT DEFAULT '{}',
    result          TEXT DEFAULT '{}',
    error_message   TEXT DEFAULT '',
    mindmap_id      INTEGER REFERENCES mindmaps(id) ON DELETE SET NULL,
    node_id         INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    completed_at    INTEGER
);

-- AI Providers (AI 服务商配置)
CREATE TABLE IF NOT EXISTS ai_providers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name    TEXT NOT NULL,
    provider_type   TEXT NOT NULL CHECK(provider_type IN ('openai','anthropic','google','local','deepseek','qwen','custom')),
    api_key         TEXT NOT NULL,
    base_url        TEXT DEFAULT '',
    model_id        TEXT NOT NULL,
    temperature     REAL DEFAULT 0.7,
    max_tokens      INTEGER DEFAULT 4096,
    is_default      INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL
);

-- App Settings (应用设置)
CREATE TABLE IF NOT EXISTS app_settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- Knowledge Bases (知识库)
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    doc_count       INTEGER DEFAULT 0,
    chunk_count     INTEGER DEFAULT 0,
    embedding_model TEXT DEFAULT '',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- Documents (文档)
CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kb_id           INTEGER NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    filepath        TEXT NOT NULL DEFAULT '',
    file_type       TEXT NOT NULL,
    file_size       INTEGER DEFAULT 0,
    content_hash    TEXT NOT NULL,
    status          TEXT DEFAULT 'indexing' CHECK(status IN ('pending','indexing','ready','error')),
    chunk_count     INTEGER DEFAULT 0,
    error_message   TEXT DEFAULT '',
    created_at      INTEGER NOT NULL
);

-- Document Chunks (文档分块)
CREATE TABLE IF NOT EXISTS document_chunks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    token_count     INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL
);

-- Chunk Embeddings (分块向量)
CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id        INTEGER PRIMARY KEY REFERENCES document_chunks(id) ON DELETE CASCADE,
    embedding       TEXT NOT NULL,
    created_at      INTEGER NOT NULL
);
`;
