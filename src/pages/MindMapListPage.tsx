import { createSignal, onMount } from 'solid-js';
import type { Mindmap } from '@/types';

interface MindMapListPageProps {
  onSelect: (mindmap: Mindmap) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function MindMapListPage(props: MindMapListPageProps) {
  const [mindmaps, setMindmaps] = createSignal<Mindmap[]>([]);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [newTitle, setNewTitle] = createSignal('');
  const [isCreating, setIsCreating] = createSignal(false);

  const loadMindmaps = async (): Promise<void> => {
    try {
      const list = (await window.electronAPI.db.listMindmaps()) as Mindmap[];
      setMindmaps(list);
    } catch (err) {
      console.error('Failed to load mindmaps:', err);
    }
  };

  onMount(() => {
    loadMindmaps();
  });

  const filteredMindmaps = () => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return mindmaps();
    return mindmaps().filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  };

  const handleCreate = async (): Promise<void> => {
    const title = newTitle().trim();
    if (!title) return;
    setIsCreating(true);
    try {
      const mindmap = (await window.electronAPI.db.createMindmap({
        title,
        description: '',
        visibility: 'private',
      })) as Mindmap;

      await window.electronAPI.db.createNode({
        mindmap_id: mindmap.id,
        parent_id: null,
        node_type: 'root',
        title: title,
      });

      setNewTitle('');
      await loadMindmaps();

      props.onSelect(mindmap);
    } catch (err) {
      console.error('Failed to create mindmap:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (!window.confirm('确定要删除这个思维导图吗？此操作不可撤销。')) return;
    try {
      await window.electronAPI.db.deleteMindmap(id);
      await loadMindmaps();
    } catch (err) {
      console.error('Failed to delete mindmap:', err);
    }
  };

  return (
    <div class="mindmap-list-page">
      <div class="mindmap-list-content">
        <div class="mindmap-list-header">
          <h1>我的思维导图</h1>
          <p class="mindmap-list-subtitle">选择一个思维导图开始编辑，或创建新的导图</p>
        </div>

        <div class="mindmap-list-actions">
          <input
            type="text"
            class="form-input mindmap-list-search"
            placeholder="搜索标题或描述..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
          <div class="create-form">
            <input
              type="text"
              class="form-input"
              placeholder="新建思维导图标题"
              value={newTitle()}
              onInput={(e) => setNewTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <button
              class="btn btn-primary"
              onClick={handleCreate}
              disabled={isCreating() || !newTitle().trim()}
            >
              {isCreating() ? '创建中...' : '创建'}
            </button>
          </div>
        </div>

        <div class="mindmap-cards mindmap-list-cards">
          {filteredMindmaps().length === 0 && (
            <div class="empty-state">
              {searchQuery().trim()
                ? '没有找到匹配的思维导图'
                : '暂无思维导图，创建一个吧'}
            </div>
          )}
          {filteredMindmaps().map((mindmap) => (
            <div
              class="mindmap-card"
              onClick={() => props.onSelect(mindmap)}
            >
              <div class="card-header">
                <span class="card-title">{mindmap.title}</span>
              </div>
              {mindmap.description && (
                <p class="card-description">{mindmap.description}</p>
              )}
              <div class="card-footer">
                <span class="card-date">
                  更新于 {formatDate(mindmap.updated_at)}
                </span>
                <button
                  class="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(mindmap.id);
                  }}
                  title="删除"
                >
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
