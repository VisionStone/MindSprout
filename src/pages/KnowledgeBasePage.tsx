import { createSignal, onMount } from 'solid-js';
import {
  kbState,
  fetchKnowledgeBases,
  fetchEmbeddingConfig,
  saveEmbeddingConfig,
  createKnowledgeBase,
  deleteKnowledgeBase,
  selectKnowledgeBase,
  uploadDocuments,
  deleteDocument,
  retryDocument,
  openFilePicker,
} from '@/stores/kbStore';
import type { KnowledgeBase, Document } from '@/types';

interface KnowledgeBasePageProps {
  // no props needed — navigation handled by global TitleBar
}

const EMBEDDING_PRESETS = [
  { label: '硅基流动 (推荐)', baseUrl: 'https://api.siliconflow.cn/v1', model: 'BAAI/bge-m3' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
  { label: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', model: 'nomic-embed-text' },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'embedding-3' },
  { label: '自定义', baseUrl: '', model: '' },
];

export default function KnowledgeBasePage(props: KnowledgeBasePageProps) {
  const [newKBName, setNewKBName] = createSignal('');
  const [newKBDesc, setNewKBDesc] = createSignal('');
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [showEmbeddingConfig, setShowEmbeddingConfig] = createSignal(false);
  const [embBaseUrl, setEmbBaseUrl] = createSignal('');
  const [embApiKey, setEmbApiKey] = createSignal('');
  const [embModel, setEmbModel] = createSignal('');
  const [embPreset, setEmbPreset] = createSignal(0);
  const [error, setError] = createSignal('');

  onMount(() => {
    fetchKnowledgeBases();
    fetchEmbeddingConfig().then(() => {
      const config = kbState().embeddingConfig;
      if (config) {
        setEmbBaseUrl(config.baseUrl);
        setEmbModel(config.model);
        const presetIdx = EMBEDDING_PRESETS.findIndex(p => p.baseUrl === config.baseUrl);
        setEmbPreset(presetIdx >= 0 ? presetIdx : EMBEDDING_PRESETS.length - 1);
      } else {
        setEmbPreset(0);
        setEmbBaseUrl(EMBEDDING_PRESETS[0].baseUrl);
        setEmbModel(EMBEDDING_PRESETS[0].model);
      }
    });
  });

  const handlePresetChange = (idx: number): void => {
    setEmbPreset(idx);
    const preset = EMBEDDING_PRESETS[idx];
    if (preset.baseUrl) {
      setEmbBaseUrl(preset.baseUrl);
      setEmbModel(preset.model);
    }
  };

  const handleSaveEmbeddingConfig = async (): Promise<void> => {
    try {
      setError('');
      const isOllama = embPreset() === 2;
      if (!embBaseUrl().trim() || !embModel().trim()) {
        setError('请填写完整的 Embedding 配置');
        return;
      }
      if (!isOllama && !embApiKey().trim()) {
        setError('请填写 API Key');
        return;
      }
      await saveEmbeddingConfig(embBaseUrl().trim(), embApiKey().trim() || 'ollama', embModel().trim());
      setShowEmbeddingConfig(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateKB = async (): Promise<void> => {
    const name = newKBName().trim();
    if (!name) return;
    try {
      setError('');
      await createKnowledgeBase(name, newKBDesc().trim() || undefined);
      setNewKBName('');
      setNewKBDesc('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteKB = async (id: number): Promise<void> => {
    try {
      setError('');
      await deleteKnowledgeBase(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSelectKB = async (kb: KnowledgeBase): Promise<void> => {
    try {
      setError('');
      await selectKnowledgeBase(kb);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpload = async (): Promise<void> => {
    const kb = kbState().currentKB;
    if (!kb) return;
    if (!kbState().embeddingConfig) {
      setError('请先配置 Embedding 服务');
      setShowEmbeddingConfig(true);
      return;
    }
    try {
      setError('');
      const files = await openFilePicker();
      if (files && files.length > 0) {
        await uploadDocuments(kb.id, files);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteDoc = async (id: number): Promise<void> => {
    try {
      setError('');
      await deleteDocument(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRetryDoc = async (id: number): Promise<void> => {
    try {
      setError('');
      await retryDocument(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBack = (): void => {
    const s = kbState();
    const updatedKBs = s.knowledgeBases;
    const current = s.currentKB;
    if (current) {
      const refreshed = updatedKBs.find(kb => kb.id === current.id);
      if (refreshed) selectKnowledgeBase(refreshed);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileTypeIcon = (fileType: string): string => {
    switch (fileType) {
      case 'pdf': return 'PDF';
      case 'md': return 'MD';
      case 'txt': return 'TXT';
      case 'docx': return 'DOC';
      default: return fileType.toUpperCase();
    }
  };

  return (
    <div class="knowledge-base-page">
      <div class="mindmap-list-content">
        <div class="mindmap-list-header">
          <h1>知识库</h1>
          <p class="mindmap-list-subtitle">管理您的知识库，上传文档用于 AI 增强生成</p>
        </div>

        {error() && (
          <div style="padding:12px 16px;margin-bottom:16px;background:rgba(239,68,68,0.08);color:var(--clr-danger);font-size:13px;border-radius:8px;">
            {error()}
          </div>
        )}

        {showEmbeddingConfig() ? (
          <div class="kb-config-panel">
            <div style="padding:14px 0;border-bottom:1px solid var(--clr-border);display:flex;align-items:center;gap:10px;">
              <button class="btn btn-ghost" onClick={() => setShowEmbeddingConfig(false)} style="padding:4px 8px;">
                <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style="font-family:var(--font-heading);font-weight:700;font-size:15px;">
                Embedding 服务配置
              </span>
            </div>
            <div style="padding:16px 0;">
              <div class="form-group">
                <label>服务提供商</label>
                <select
                  class="form-input"
                  value={embPreset()}
                  onChange={(e) => handlePresetChange(Number(e.currentTarget.value))}
                  style="cursor:pointer;"
                >
                  {EMBEDDING_PRESETS.map((p, i) => (
                    <option value={i}>{p.label}</option>
                  ))}
                </select>
              </div>
              {embPreset() === EMBEDDING_PRESETS.length - 1 && (
                <div class="form-group">
                  <label>API 地址</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="https://api.example.com/v1"
                    value={embBaseUrl()}
                    onInput={(e) => setEmbBaseUrl(e.currentTarget.value)}
                  />
                </div>
              )}
              {embPreset() !== 2 && (
                <div class="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    class="form-input"
                    placeholder={embPreset() === 0 ? '输入硅基流动 API Key' : embPreset() === 1 ? '输入 OpenAI API Key' : embPreset() === 3 ? '输入智谱 API Key' : '输入 API Key'}
                    value={embApiKey()}
                    onInput={(e) => setEmbApiKey(e.currentTarget.value)}
                  />
                </div>
              )}
              {embPreset() === EMBEDDING_PRESETS.length - 1 && (
                <div class="form-group">
                  <label>Embedding 模型</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="text-embedding-3-small"
                    value={embModel()}
                    onInput={(e) => setEmbModel(e.currentTarget.value)}
                  />
                </div>
              )}
              {embPreset() !== EMBEDDING_PRESETS.length - 1 && embPreset() !== EMBEDDING_PRESETS.length - 2 && (
                <div style="margin-top:4px;padding:10px 14px;border-radius:8px;background:rgba(139,92,246,0.05);font-size:12px;color:var(--clr-text-secondary);line-height:1.6;">
                  <div>模型: <strong>{embModel()}</strong></div>
                  <div>API: <code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:11px;">{embBaseUrl()}/embeddings</code></div>
                </div>
              )}
              <div style="margin-top:8px;padding:10px 14px;border-radius:8px;background:rgba(139,92,246,0.05);font-size:12px;color:var(--clr-text-secondary);line-height:1.6;">
                <div style="font-weight:600;margin-bottom:4px;color:var(--clr-text);">配置说明</div>
                <div>· 硅基流动 (推荐)：支持 BGE-M3 等开源模型，中文效果好，注册即送额度</div>
                <div>· DeepSeek 不支持 Embedding API，不可用于此服务</div>
                <div>· Ollama：本地免费，无需 API Key，需先运行 <code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;">ollama pull nomic-embed-text</code></div>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                <button class="btn btn-ghost" onClick={() => setShowEmbeddingConfig(false)}>取消</button>
                <button class="btn btn-primary" onClick={handleSaveEmbeddingConfig}>保存配置</button>
              </div>
            </div>
          </div>
        ) : kbState().currentKB ? (
          <div class="kb-detail-panel">
            <div style="padding:14px 0;border-bottom:1px solid var(--clr-border);display:flex;align-items:center;gap:10px;">
              <button class="btn btn-ghost" onClick={handleBack} style="padding:4px 8px;">
                <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style="font-family:var(--font-heading);font-weight:700;font-size:15px;flex:1;">
                {kbState().currentKB!.name}
              </span>
              <button class="btn btn-primary" onClick={handleUpload} disabled={kbState().uploading} style="padding:6px 14px;font-size:12px;">
                {kbState().uploading ? '上传中...' : '上传文档'}
              </button>
            </div>
            <div style="padding:16px 0;">
              {kbState().documents.length === 0 ? (
                <div class="empty-state">
                  暂无文档，点击"上传文档"添加文件
                </div>
              ) : (
                <div class="mindmap-cards">
                  {kbState().documents.map((doc: Document) => (
                    <div class="mindmap-card">
                      <div class="card-header">
                        <span class="card-title" style="display:flex;align-items:center;gap:8px;">
                          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(139,92,246,0.1);color:var(--clr-primary);">
                            {fileTypeIcon(doc.file_type)}
                          </span>
                          {doc.filename}
                        </span>
                        <span style="display:flex;align-items:center;gap:8px;">
                          <span style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600;letter-spacing:0.02em;background:rgba(16,185,129,0.1);color:var(--clr-success);">
                            {doc.status === 'ready' ? '已就绪' : doc.status === 'indexing' ? '索引中' : doc.status === 'error' ? '错误' : '等待中'}
                          </span>
                          <button
                            class="delete-btn"
                            onClick={() => handleDeleteDoc(doc.id)}
                            title="删除"
                            style="opacity:0.5;"
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--clr-danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = ''; }}
                          >
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </span>
                      </div>
                      <div class="card-footer" style="margin-top:6px;">
                        <span class="card-date">{formatFileSize(doc.file_size)} · {doc.chunk_count} 个分块</span>
                      </div>
                      {doc.error_message && (
                        <div style="margin-top:6px;font-size:12px;color:var(--clr-danger);display:flex;align-items:center;gap:8px;">
                          <span style="flex:1;">{doc.error_message}</span>
                          <button
                            class="btn btn-ghost"
                            onClick={() => handleRetryDoc(doc.id)}
                            disabled={kbState().uploading}
                            style="padding:2px 8px;font-size:11px;color:var(--clr-primary);cursor:pointer;"
                          >
                            重试
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style="padding:14px 0;border-bottom:1px solid var(--clr-border);display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:13px;color:var(--clr-text-secondary);">选择或创建知识库</span>
                {kbState().embeddingConfig ? (
                  <span style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600;background:rgba(16,185,129,0.1);color:var(--clr-success);">
                    Embedding: {kbState().embeddingConfig!.model}
                  </span>
                ) : (
                  <span style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600;background:rgba(239,68,68,0.1);color:var(--clr-danger);">
                    未配置 Embedding
                  </span>
                )}
              </span>
              <span style="display:flex;gap:6px;">
                <button class="btn btn-ghost" onClick={() => setShowEmbeddingConfig(true)} style="padding:6px 10px;font-size:12px;">
                  <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  配置
                </button>
                <button class="btn btn-primary" onClick={() => setShowCreateForm(!showCreateForm())} style="padding:6px 14px;font-size:12px;">
                  {showCreateForm() ? '取消' : '新建知识库'}
                </button>
              </span>
            </div>

            {showCreateForm() && (
              <div style="padding:16px 0;border-bottom:1px solid var(--clr-border);">
                <div class="form-group">
                  <label>名称</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="输入知识库名称"
                    value={newKBName()}
                    onInput={(e) => setNewKBName(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateKB(); }}
                  />
                </div>
                <div class="form-group">
                  <label>描述（可选）</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="简要描述知识库用途"
                    value={newKBDesc()}
                    onInput={(e) => setNewKBDesc(e.currentTarget.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateKB(); }}
                  />
                </div>
                <div style="display:flex;justify-content:flex-end;">
                  <button class="btn btn-primary" onClick={handleCreateKB} disabled={!newKBName().trim()}>
                    创建
                  </button>
                </div>
              </div>
            )}

            <div style="padding:16px 0;">
              {kbState().knowledgeBases.length === 0 ? (
                <div class="empty-state">
                  暂无知识库，点击"新建知识库"开始
                </div>
              ) : (
                <div class="mindmap-cards">
                  {kbState().knowledgeBases.map((kb: KnowledgeBase) => (
                    <div class="mindmap-card" onClick={() => handleSelectKB(kb)}>
                      <div class="card-header">
                        <span class="card-title">{kb.name}</span>
                        <button
                          class="delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteKB(kb.id);
                          }}
                          title="删除"
                          style="opacity:0.5;"
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--clr-danger)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = ''; }}
                        >
                          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                      {kb.description && (
                        <div class="card-description">{kb.description}</div>
                      )}
                      <div class="card-footer">
                        <span class="card-date">{kb.doc_count} 个文档 · {kb.chunk_count} 个分块</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
