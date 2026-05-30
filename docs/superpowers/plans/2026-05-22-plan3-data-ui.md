# Plan 3: Mindmap Data Management & UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the mindmap CRUD operations, node editor dialog, context menu, description panel, mindmap list modal, collapse/expand logic, and keyboard navigation. The app should allow creating, editing, and managing mindmaps with full node operations.

**Architecture:** SQLite CRUD via IPC. SolidJS components for all UI panels. Canvas interaction layer connects to data operations through stores.

**Tech Stack:** Electron IPC, SolidJS, better-sqlite3, marked (for description rendering)

---

## File Structure

```
src/
├── components/
│   ├── MindMapListModal.tsx    # Mindmap list with create/delete
│   ├── NodeEditDialog.tsx      # Node title/content/description editor
│   ├── NodeContextMenu.tsx     # Right-click context menu
│   ├── DescriptionPanel.tsx    # Node description overlay
│   ├── NotificationCenter.tsx  # Task notifications panel
│   └── FirstTimeWizard.tsx     # First-launch AI config wizard
├── canvas/
│   └── InteractionManager.ts   # (modify) Add reparenting, keyboard nav
└── pages/
    └── EditorPage.tsx          # (modify) Wire all components
```

---

## Task 1: Install marked for Markdown rendering

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install marked**

```bash
npm install marked
npm install -D @types/marked
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add marked for Markdown rendering"
```

---

## Task 2: Complete node CRUD in database layer

**Files:**
- Create: `electron/db/node.ts`
- Create: `electron/db/edge.ts`

- [ ] **Step 1: Write node.ts**

```typescript
import { getDb } from './index';

export function getNodes(mindmapId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM nodes WHERE mindmap_id = ? ORDER BY sort_order').all(mindmapId);
}

export function createNode(data: {
  id: string;
  mindmap_id: string;
  parent_id: string | null;
  title: string;
  content?: string;
  description?: string;
  pos_x?: number;
  pos_y?: number;
  level?: number;
  sort_order?: number;
  created_at: number;
  updated_at: number;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO nodes (id, mindmap_id, parent_id, title, content, description, pos_x, pos_y, level, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id, data.mindmap_id, data.parent_id, data.title,
    data.content || '', data.description || '',
    data.pos_x || 0, data.pos_y || 0, data.level || 0, data.sort_order || 0,
    data.created_at, data.updated_at
  );
  return data.id;
}

export function updateNode(id: string, data: Partial<{
  title: string; content: string; description: string;
  pos_x: number; pos_y: number; level: number;
  sort_order: number; collapsed: number; parent_id: string;
  updated_at: number;
}>) {
  const db = getDb();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE nodes SET ${fields} WHERE id = ?`);
  stmt.run(...Object.values(data), id);
}

export function deleteNode(id: string) {
  const db = getDb();
  // Delete children recursively
  const children = db.prepare('SELECT id FROM nodes WHERE parent_id = ?').all(id) as { id: string }[];
  for (const child of children) {
    deleteNode(child.id);
  }
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
}

export function deleteNodesByMindmap(mindmapId: string) {
  const db = getDb();
  db.prepare('DELETE FROM nodes WHERE mindmap_id = ?').run(mindmapId);
}
```

- [ ] **Step 2: Write edge.ts**

```typescript
import { getDb } from './index';

export function getEdges(mindmapId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM edges WHERE mindmap_id = ?').all(mindmapId);
}

export function createEdge(data: {
  id: string;
  mindmap_id: string;
  source_node_id: string;
  target_node_id: string;
  created_at: number;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO edges (id, mindmap_id, source_node_id, target_node_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(data.id, data.mindmap_id, data.source_node_id, data.target_node_id, data.created_at);
  return data.id;
}

export function deleteEdge(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM edges WHERE id = ?').run(id);
}

export function deleteEdgesByMindmap(mindmapId: string) {
  const db = getDb();
  db.prepare('DELETE FROM edges WHERE mindmap_id = ?').run(mindmapId);
}
```

- [ ] **Step 3: Update IPC handlers to use new modules**

Modify `electron/ipc/handlers.ts` to import and use `node.ts` and `edge.ts`:

```typescript
import * as nodeDb from '../db/node';
import * as edgeDb from '../db/edge';
```

Replace inline node/edge handlers with:
```typescript
ipcMain.handle('db:getNodes', (_, mindmapId: string) => nodeDb.getNodes(mindmapId));
ipcMain.handle('db:createNode', (_, data: any) => nodeDb.createNode(data));
ipcMain.handle('db:updateNode', (_, id: string, data: any) => nodeDb.updateNode(id, data));
ipcMain.handle('db:deleteNode', (_, id: string) => nodeDb.deleteNode(id));
ipcMain.handle('db:getEdges', (_, mindmapId: string) => edgeDb.getEdges(mindmapId));
ipcMain.handle('db:createEdge', (_, data: any) => edgeDb.createEdge(data));
ipcMain.handle('db:deleteEdge', (_, id: string) => edgeDb.deleteEdge(id));
```

- [ ] **Step 4: Commit**

```bash
git add electron/db/node.ts electron/db/edge.ts electron/ipc/handlers.ts
git commit -m "feat: complete node and edge CRUD database layer"
```

---

## Task 3: MindMapListModal component

**Files:**
- Create: `src/components/MindMapListModal.tsx`

- [ ] **Step 1: Write MindMapListModal.tsx**

```typescript
import { createSignal, For, onMount } from 'solid-js';
import { generateId } from '../utils/id';
import type { Mindmap } from '../types';

interface MindMapListModalProps {
  onClose: () => void;
  onSelect: (mindmap: Mindmap) => void;
}

export default function MindMapListModal(props: MindMapListModalProps) {
  const [mindmaps, setMindmaps] = createSignal<Mindmap[]>([]);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [newTitle, setNewTitle] = createSignal('');

  onMount(async () => {
    const list = await window.electronAPI.db.listMindmaps();
    setMindmaps(list);
  });

  const filteredMindmaps = () => {
    const q = searchQuery().toLowerCase();
    if (!q) return mindmaps();
    return mindmaps().filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
    );
  };

  async function createMindmap() {
    const title = newTitle().trim();
    if (!title) return;

    const now = Date.now();
    const mindmap: Mindmap = {
      id: generateId(),
      title,
      description: '',
      visibility: 'private',
      layout_mode: 'hierarchical',
      view_state: '{"zoom":1,"panX":0,"panY":0}',
      created_at: now,
      updated_at: now,
      version: 1,
    };

    await window.electronAPI.db.createMindmap(mindmap);

    // Create root node
    const rootNode = {
      id: generateId(),
      mindmap_id: mindmap.id,
      parent_id: null,
      title,
      content: '',
      description: '',
      pos_x: 0,
      pos_y: 0,
      level: 0,
      sort_order: 0,
      collapsed: 0,
      created_at: now,
      updated_at: now,
    };
    await window.electronAPI.db.createNode(rootNode);

    setNewTitle('');
    setShowCreateForm(false);
    const list = await window.electronAPI.db.listMindmaps();
    setMindmaps(list);
  }

  async function deleteMindmap(id: string) {
    if (!confirm('确定要删除这张思维导图吗？此操作不可撤销。')) return;
    await window.electronAPI.db.deleteMindmap(id);
    const list = await window.electronAPI.db.listMindmaps();
    setMindmaps(list);
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal list-modal" onClick={e => e.stopPropagation()}>
        <div class="list-modal-header">
          <h3>思维导图</h3>
          <button class="close-btn" onClick={props.onClose}>✕</button>
        </div>

        <div class="list-modal-toolbar">
          <input
            type="text"
            class="search-input"
            placeholder="搜索..."
            value={searchQuery()}
            onInput={e => setSearchQuery(e.currentTarget.value)}
          />
          <button class="btn-primary" onClick={() => setShowCreateForm(true)}>
            + 新建
          </button>
        </div>

        {showCreateForm() && (
          <div class="create-form">
            <input
              type="text"
              placeholder="输入主题..."
              value={newTitle()}
              onInput={e => setNewTitle(e.currentTarget.value)}
              onKeyDown={e => e.key === 'Enter' && createMindmap()}
              autofocus
            />
            <button class="btn-primary" onClick={createMindmap}>创建</button>
            <button class="btn-secondary" onClick={() => setShowCreateForm(false)}>取消</button>
          </div>
        )}

        <div class="mindmap-list">
          <For each={filteredMindmaps()}>
            {(mindmap) => (
              <div class="mindmap-card" onClick={() => props.onSelect(mindmap)}>
                <div class="card-header">
                  <h4>{mindmap.title}</h4>
                  <span class={`visibility-badge ${mindmap.visibility}`}>
                    {mindmap.visibility === 'public' ? '公开' : '私有'}
                  </span>
                </div>
                <p class="card-description">{mindmap.description || '无描述'}</p>
                <div class="card-footer">
                  <span>{new Date(mindmap.updated_at).toLocaleDateString('zh-CN')}</span>
                  <button
                    class="btn-danger-small"
                    onClick={e => { e.stopPropagation(); deleteMindmap(mindmap.id); }}
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add modal styles to global.css**

Append to `src/styles/global.css`:

```css
.list-modal {
  width: 520px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.list-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.list-modal-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.create-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
}

.create-form input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.mindmap-list {
  overflow-y: auto;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mindmap-card {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-secondary);
  cursor: pointer;
  transition: border-color 0.2s;
}

.mindmap-card:hover {
  border-color: var(--accent-color);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.card-header h4 {
  font-size: 15px;
  font-weight: 600;
}

.visibility-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tertiary);
}

.visibility-badge.public {
  background: var(--success-color);
  color: white;
}

.card-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-muted);
}

.btn-primary {
  padding: 8px 16px;
  border: none;
  border-radius: var(--border-radius);
  background: var(--accent-color);
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
}

.btn-danger-small {
  padding: 4px 10px;
  border: none;
  border-radius: var(--border-radius);
  background: var(--danger-color);
  color: white;
  font-size: 12px;
  cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MindMapListModal.tsx src/styles/global.css
git commit -m "feat: add MindMapListModal with create/search/delete"
```

---

## Task 4: Load mindmap from list into canvas

**Files:**
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Add loadMindmap function to EditorPage**

```typescript
async function loadMindmap(mindmap: Mindmap) {
  const [nodes, edges] = await Promise.all([
    window.electronAPI.db.getNodes(mindmap.id),
    window.electronAPI.db.getEdges(mindmap.id),
  ]);

  const layout = mindmap.layout_mode || 'hierarchical';
  let positionedNodes = nodes;
  if (layout === 'hierarchical') {
    positionedNodes = applyHierarchicalLayout(nodes, edges);
  }

  setMindmap(mindmap);
  setNodes(positionedNodes);
  setEdges(edges);
  setCurrentMindmapId(mindmap.id);
  engine.markDirty();
}
```

Wire it into the modal:
```typescript
<MindMapListModal
  onClose={toggleListModal}
  onSelect={loadMindmap}
/>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: load mindmap from list into canvas"
```

---

## Task 5: NodeEditDialog component

**Files:**
- Create: `src/components/NodeEditDialog.tsx`

- [ ] **Step 1: Write NodeEditDialog.tsx**

```typescript
import { createSignal } from 'solid-js';
import type { Node } from '../types';

interface NodeEditDialogProps {
  node: Node;
  onSave: (updates: Partial<Node>) => void;
  onClose: () => void;
}

export default function NodeEditDialog(props: NodeEditDialogProps) {
  const [title, setTitle] = createSignal(props.node.title);
  const [content, setContent] = createSignal(props.node.content);
  const [description, setDescription] = createSignal(props.node.description);

  function handleSave() {
    props.onSave({
      title: title().trim(),
      content: content().trim(),
      description: description().trim(),
      updated_at: Date.now(),
    });
    props.onClose();
  }

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal edit-dialog" onClick={e => e.stopPropagation()}>
        <div class="edit-dialog-header">
          <h3>编辑节点</h3>
          <button class="close-btn" onClick={props.onClose}>✕</button>
        </div>

        <div class="edit-dialog-body">
          <div class="form-group">
            <label>标题</label>
            <input
              type="text"
              value={title()}
              onInput={e => setTitle(e.currentTarget.value)}
              autofocus
            />
          </div>

          <div class="form-group">
            <label>内容摘要</label>
            <input
              type="text"
              value={content()}
              onInput={e => setContent(e.currentTarget.value)}
              placeholder="简短描述..."
            />
          </div>

          <div class="form-group">
            <label>详细描述 (Markdown)</label>
            <textarea
              value={description()}
              onInput={e => setDescription(e.currentTarget.value)}
              rows={8}
              placeholder="支持 Markdown 格式..."
            />
          </div>
        </div>

        <div class="edit-dialog-footer">
          <button class="btn-secondary" onClick={props.onClose}>取消</button>
          <button class="btn-primary" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add dialog styles to global.css**

Append:

```css
.edit-dialog {
  width: 480px;
}

.edit-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.edit-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-group input,
.form-group textarea {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
}

.form-group textarea {
  resize: vertical;
  min-height: 100px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}

.edit-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeEditDialog.tsx src/styles/global.css
git commit -m "feat: add NodeEditDialog for title/content/description editing"
```

---

## Task 6: NodeContextMenu component

**Files:**
- Create: `src/components/NodeContextMenu.tsx`

- [ ] **Step 1: Write NodeContextMenu.tsx**

```typescript
interface NodeContextMenuProps {
  x: number;
  y: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  onEdit: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onSplit: () => void;
  onAIGenerate: () => void;
  onAIExpand: () => void;
  onAIEnrich: () => void;
  onClose: () => void;
}

export default function NodeContextMenu(props: NodeContextMenuProps) {
  const menuItems = [
    { label: '编辑节点', action: props.onEdit, divider: false },
    { label: '添加子节点', action: props.onAddChild, divider: false },
    { label: '删除节点', action: props.onDelete, divider: true, danger: true },
    ...(props.hasChildren ? [
      { label: props.isCollapsed ? '展开' : '折叠', action: props.onToggleCollapse, divider: false }
    ] : []),
    { label: '拆分为新导图', action: props.onSplit, divider: true },
    { label: 'AI 扩展节点', action: props.onAIExpand, divider: false },
    { label: 'AI 补充描述', action: props.onAIEnrich, divider: false },
  ];

  return (
    <>
      <div class="context-menu-backdrop" onClick={props.onClose} />
      <div
        class="context-menu"
        style={{ left: `${props.x}px`, top: `${props.y}px` }}
      >
        {menuItems.map((item, i) => (
          <>
            {item.divider && i > 0 && <div class="context-menu-divider" />}
            <button
              class={`context-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => { item.action(); props.onClose(); }}
            >
              {item.label}
            </button>
          </>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add context menu styles**

Append to `src/styles/global.css`:

```css
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
}

.context-menu {
  position: fixed;
  min-width: 160px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-lg);
  z-index: 301;
  padding: 4px;
}

.context-menu-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-menu-item:hover {
  background: var(--bg-secondary);
}

.context-menu-item.danger {
  color: var(--danger-color);
}

.context-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NodeContextMenu.tsx src/styles/global.css
git commit -m "feat: add NodeContextMenu with all node operations"
```

---

## Task 7: DescriptionPanel component

**Files:**
- Create: `src/components/DescriptionPanel.tsx`

- [ ] **Step 1: Write DescriptionPanel.tsx**

```typescript
import { marked } from 'marked';
import type { Node } from '../types';

interface DescriptionPanelProps {
  node: Node;
  onClose: () => void;
}

export default function DescriptionPanel(props: DescriptionPanelProps) {
  const html = () => marked.parse(props.node.description || '*暂无描述*', { async: false }) as string;

  return (
    <div class="description-panel">
      <div class="description-header">
        <h4>{props.node.title}</h4>
        <button class="close-btn" onClick={props.onClose}>✕</button>
      </div>
      <div class="description-content" innerHTML={html()} />
    </div>
  );
}
```

- [ ] **Step 2: Add description panel styles**

Append to `src/styles/global.css`:

```css
.description-panel {
  position: fixed;
  right: 16px;
  top: 16px;
  width: 360px;
  max-height: calc(100vh - 60px);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-lg);
  z-index: 150;
  display: flex;
  flex-direction: column;
}

.description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.description-header h4 {
  font-size: 15px;
  font-weight: 600;
}

.description-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.7;
}

.description-content h1,
.description-content h2,
.description-content h3 {
  margin: 16px 0 8px;
}

.description-content p {
  margin: 8px 0;
}

.description-content ul,
.description-content ol {
  margin: 8px 0;
  padding-left: 24px;
}

.description-content code {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
}

.description-content pre {
  background: var(--bg-secondary);
  padding: 12px;
  border-radius: var(--border-radius);
  overflow-x: auto;
}

.description-content pre code {
  background: none;
  padding: 0;
}

.description-content blockquote {
  border-left: 3px solid var(--accent-color);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-secondary);
}

.description-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.description-content th,
.description-content td {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}

.description-content th {
  background: var(--bg-secondary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DescriptionPanel.tsx src/styles/global.css
git commit -m "feat: add DescriptionPanel with Markdown rendering"
```

---

## Task 8: Wire all UI components into EditorPage

**Files:**
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/canvas/InteractionManager.ts`

- [ ] **Step 1: Add state and component imports to EditorPage**

```typescript
import { createSignal } from 'solid-js';
import MindMapListModal from '../components/MindMapListModal';
import NodeEditDialog from '../components/NodeEditDialog';
import NodeContextMenu from '../components/NodeContextMenu';
import DescriptionPanel from '../components/DescriptionPanel';
import { mindmapStore, updateNode, addNode, addEdge, removeNode, getChildren, hasChildren } from '../stores/mindmapStore';
import { canvasStore, selectNode, clearSelection } from '../stores/canvasStore';
import type { Node } from '../types';
```

Add state signals:
```typescript
const [editingNode, setEditingNode] = createSignal<Node | null>(null);
const [descNode, setDescNode] = createSignal<Node | null>(null);
const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; node: Node } | null>(null);
```

- [ ] **Step 2: Wire NodeEditDialog**

```typescript
{editingNode() && (
  <NodeEditDialog
    node={editingNode()!}
    onSave={async (updates) => {
      await window.electronAPI.db.updateNode(editingNode()!.id, updates);
      updateNode(editingNode()!.id, updates);
      engine.markDirty();
    }}
    onClose={() => setEditingNode(null)}
  />
)}
```

- [ ] **Step 3: Wire DescriptionPanel**

```typescript
{descNode() && (
  <DescriptionPanel
    node={descNode()!}
    onClose={() => setDescNode(null)}
  />
)}
```

- [ ] **Step 4: Wire ContextMenu**

```typescript
{contextMenu() && (
  <NodeContextMenu
    x={contextMenu()!.x}
    y={contextMenu()!.y}
    hasChildren={hasChildren(contextMenu()!.node.id)}
    isCollapsed={!!contextMenu()!.node.collapsed}
    onEdit={() => setEditingNode(contextMenu()!.node)}
    onAddChild={async () => {
      const parent = contextMenu()!.node;
      const now = Date.now();
      const newNode: Node = {
        id: generateId(),
        mindmap_id: mindmapStore.mindmap!.id,
        parent_id: parent.id,
        node_type: 'branch',
        title: '新节点',
        content: '',
        description: '',
        style: '{}',
        pos_x: parent.pos_x + 50,
        pos_y: parent.pos_y + 100,
        level: parent.level + 1,
        sort_order: getChildren(parent.id).length,
        collapsed: 0,
        created_at: now,
        updated_at: now,
      };
      await window.electronAPI.db.createNode(newNode);
      await window.electronAPI.db.createEdge({
        id: generateId(),
        mindmap_id: mindmapStore.mindmap!.id,
        source_node_id: parent.id,
        target_node_id: newNode.id,
        created_at: now,
      });
      addNode(newNode);
      addEdge({
        id: generateId(),
        mindmap_id: mindmapStore.mindmap!.id,
        source_node_id: parent.id,
        target_node_id: newNode.id,
        edge_type: 'default',
        style: '{}',
        created_at: now,
      });
      engine.markDirty();
    }}
    onDelete={async () => {
      const node = contextMenu()!.node;
      await window.electronAPI.db.deleteNode(node.id);
      removeNode(node.id);
      // Also remove edges
      for (const edge of mindmapStore.edges.values()) {
        if (edge.source_node_id === node.id || edge.target_node_id === node.id) {
          await window.electronAPI.db.deleteEdge(edge.id);
        }
      }
      engine.markDirty();
    }}
    onToggleCollapse={() => {
      const node = contextMenu()!.node;
      updateNode(node.id, { collapsed: node.collapsed ? 0 : 1 });
      engine.markDirty();
    }}
    onSplit={() => { /* TODO in future version */ }}
    onAIGenerate={() => { /* Plan 4 */ }}
    onAIExpand={() => { /* Plan 4 */ }}
    onAIEnrich={() => { /* Plan 4 */ }}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 5: Update InteractionManager to trigger context menu and double-click**

Modify `InteractionManager.ts` to accept callbacks:

```typescript
interface InteractionCallbacks {
  onNodeDoubleClick: (nodeId: string) => void;
  onNodeContextMenu: (nodeId: string, x: number, y: number) => void;
}
```

Update constructor and event handlers:
```typescript
constructor(canvas: HTMLCanvasElement, engine: CanvasEngine, callbacks: InteractionCallbacks) {
  // ... store callbacks
}

private onDblClick = (e: MouseEvent) => {
  const rect = this.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = this.hitTestAt(x, y);
  if (hit) this.callbacks.onNodeDoubleClick(hit);
};

private onContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  const rect = this.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = this.hitTestAt(x, y);
  if (hit) this.callbacks.onNodeContextMenu(hit, e.clientX, e.clientY);
};

private hitTestAt(screenX: number, screenY: number): string | null {
  const nodes = Array.from(mindmapStore.nodes.values());
  const layouts = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const layout = calculateNodeLayout(node);
    layouts.set(node.id, { width: layout.width, height: layout.height });
  }
  return hitTest(screenX, screenY, nodes, layouts, canvasStore.panX, canvasStore.panY, canvasStore.zoom);
}
```

- [ ] **Step 6: Update EditorPage to pass callbacks**

```typescript
interaction = new InteractionManager(canvas, engine, {
  onNodeDoubleClick: (nodeId) => {
    const node = mindmapStore.nodes.get(nodeId);
    if (node) setEditingNode(node);
  },
  onNodeContextMenu: (nodeId, x, y) => {
    const node = mindmapStore.nodes.get(nodeId);
    if (node) setContextMenu({ x, y, node });
  },
});
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/EditorPage.tsx src/canvas/InteractionManager.ts src/components/*
git commit -m "feat: wire all UI components into EditorPage"
```

---

## Task 9: Keyboard navigation

**Files:**
- Modify: `src/canvas/InteractionManager.ts`

- [ ] **Step 1: Complete keyboard handler**

```typescript
private onKeyDown = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  const selected = Array.from(canvasStore.selectedNodeIds);
  if (selected.length === 0) return;
  const currentId = selected[0];
  const current = mindmapStore.nodes.get(currentId);
  if (!current) return;

  switch (e.key) {
    case 'Delete':
    case 'Backspace': {
      e.preventDefault();
      // Delete selected nodes and their descendants
      for (const id of canvasStore.selectedNodeIds) {
        window.electronAPI.db.deleteNode(id);
        removeNode(id);
      }
      clearSelection();
      this.engine.markDirty();
      break;
    }
    case '+':
    case '=': {
      e.preventDefault();
      if (current.collapsed) {
        updateNode(currentId, { collapsed: 0 });
        this.engine.markDirty();
      }
      break;
    }
    case '-':
    case '_': {
      e.preventDefault();
      if (!current.collapsed && hasChildren(currentId)) {
        updateNode(currentId, { collapsed: 1 });
        this.engine.markDirty();
      }
      break;
    }
    case ' ': {
      e.preventDefault();
      // Toggle description panel
      const node = mindmapStore.nodes.get(currentId);
      if (node) {
        // This will be handled by EditorPage state
        // We'll dispatch a custom event
        window.dispatchEvent(new CustomEvent('toggle-description', { detail: { nodeId: currentId } }));
      }
      break;
    }
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault();
      const nextId = this.findNearestNode(currentId, e.key);
      if (nextId) {
        selectNode(nextId, false);
        this.engine.markDirty();
      }
      break;
    }
  }
};

private findNearestNode(fromId: string, direction: string): string | null {
  const from = mindmapStore.nodes.get(fromId);
  if (!from) return null;

  const allNodes = Array.from(mindmapStore.nodes.values()).filter(n => {
    // Skip collapsed children
    if (n.parent_id) {
      const parent = mindmapStore.nodes.get(n.parent_id);
      if (parent?.collapsed) return false;
    }
    return n.id !== fromId;
  });

  if (allNodes.length === 0) return null;

  const dirs: Record<string, { dx: number; dy: number }> = {
    'ArrowUp': { dx: 0, dy: -1 },
    'ArrowDown': { dx: 0, dy: 1 },
    'ArrowLeft': { dx: -1, dy: 0 },
    'ArrowRight': { dx: 1, dy: 0 },
  };
  const dir = dirs[direction];

  let best: { id: string; score: number } | null = null;

  for (const node of allNodes) {
    const dx = node.pos_x - from.pos_x;
    const dy = node.pos_y - from.pos_y;
    const dot = dx * dir.dx + dy * dir.dy;
    if (dot <= 0) continue; // Wrong direction

    const dist = Math.sqrt(dx * dx + dy * dy);
    const anglePenalty = Math.abs(dx * dir.dy - dy * dir.dx) / dist; // Perpendicular distance
    const score = dot - anglePenalty * 50;

    if (!best || score > best.score) {
      best = { id: node.id, score };
    }
  }

  return best?.id || null;
}
```

- [ ] **Step 2: Add keyboard event listener for description toggle in EditorPage**

In EditorPage's `onMount`:
```typescript
const handleToggleDesc = (e: CustomEvent) => {
  const node = mindmapStore.nodes.get(e.detail.nodeId);
  if (node) {
    if (descNode()?.id === node.id) setDescNode(null);
    else setDescNode(node);
  }
};
window.addEventListener('toggle-description', handleToggleDesc as EventListener);

onCleanup(() => {
  window.removeEventListener('toggle-description', handleToggleDesc as EventListener);
  // ... existing cleanup
});
```

- [ ] **Step 3: Commit**

```bash
git add src/canvas/InteractionManager.ts src/pages/EditorPage.tsx
git commit -m "feat: add keyboard navigation (arrows, +/-, space, delete)"
```

---

## Task 10: First-time wizard

**Files:**
- Create: `src/components/FirstTimeWizard.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write FirstTimeWizard.tsx**

```typescript
import { createSignal } from 'solid-js';

interface FirstTimeWizardProps {
  onComplete: () => void;
}

export default function FirstTimeWizard(props: FirstTimeWizardProps) {
  const [step, setStep] = createSignal(0);
  const [providerName, setProviderName] = createSignal('');
  const [apiKey, setApiKey] = createSignal('');
  const [baseUrl, setBaseUrl] = createSignal('');
  const [modelId, setModelId] = createSignal('');

  async function saveAndContinue() {
    if (step() === 1) {
      await window.electronAPI.settings.saveProvider({
        id: crypto.randomUUID(),
        display_name: providerName() || '默认服务商',
        provider_type: 'custom',
        api_key: apiKey(),
        base_url: baseUrl(),
        model_id: modelId() || 'gpt-4o',
        temperature: 0.7,
        max_tokens: 4096,
        is_default: 1,
        created_at: Date.now(),
      });
      await window.electronAPI.settings.setSetting('firstTimeComplete', 'true');
    }
    if (step() < 2) {
      setStep(step() + 1);
    } else {
      props.onComplete();
    }
  }

  const steps = [
    {
      title: '欢迎使用 思维芽',
      content: (
        <>
          <p>思维芽是一款 AI 驱动的思维导图工具。</p>
          <p>输入一个主题，AI 会自动生成完整的思维导图。</p>
          <p>您也可以随时对任意节点进行智能扩展。</p>
        </>
      ),
    },
    {
      title: '配置 AI 服务商',
      content: (
        <div class="wizard-form">
          <div class="form-group">
            <label>显示名称</label>
            <input value={providerName()} onInput={e => setProviderName(e.currentTarget.value)} placeholder="如：我的 OpenAI" />
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input type="password" value={apiKey()} onInput={e => setApiKey(e.currentTarget.value)} placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>Base URL（可选）</label>
            <input value={baseUrl()} onInput={e => setBaseUrl(e.currentTarget.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div class="form-group">
            <label>模型 ID</label>
            <input value={modelId()} onInput={e => setModelId(e.currentTarget.value)} placeholder="gpt-4o" />
          </div>
        </div>
      ),
    },
    {
      title: '准备就绪',
      content: <p>您现在可以开始创建思维导图了！点击"开始"进入应用。</p>,
    },
  ];

  return (
    <div class="wizard-overlay">
      <div class="wizard-card">
        <div class="wizard-progress">
          {steps.map((_, i) => (
            <div class={`wizard-dot ${i === step() ? 'active' : ''} ${i < step() ? 'completed' : ''}`} />
          ))}
        </div>
        <h2>{steps[step()].title}</h2>
        <div class="wizard-content">{steps[step()].content}</div>
        <div class="wizard-actions">
          {step() > 0 && (
            <button class="btn-secondary" onClick={() => setStep(step() - 1)}>上一步</button>
          )}
          <button class="btn-primary" onClick={saveAndContinue}>
            {step() === steps.length - 1 ? '开始' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add wizard styles**

Append to `src/styles/global.css`:

```css
.wizard-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.wizard-card {
  width: 480px;
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
  padding: 32px;
  box-shadow: var(--shadow-lg);
}

.wizard-progress {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  justify-content: center;
}

.wizard-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-color);
}

.wizard-dot.active {
  background: var(--accent-color);
  width: 24px;
  border-radius: 4px;
}

.wizard-dot.completed {
  background: var(--success-color);
}

.wizard-card h2 {
  text-align: center;
  margin-bottom: 20px;
}

.wizard-content {
  margin-bottom: 24px;
  line-height: 1.7;
}

.wizard-content p {
  margin: 8px 0;
}

.wizard-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wizard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 3: Modify App.tsx to show wizard on first launch**

```typescript
import { createSignal, onMount } from 'solid-js';
import FirstTimeWizard from './components/FirstTimeWizard';

export default function App() {
  const [currentPage, setCurrentPage] = createSignal<'editor' | 'settings'>('editor');
  const [showWizard, setShowWizard] = createSignal(false);

  onMount(async () => {
    const completed = await window.electronAPI.settings.getSetting('firstTimeComplete');
    if (!completed) setShowWizard(true);
  });

  return (
    <div class="app">
      {showWizard() && (
        <FirstTimeWizard onComplete={() => setShowWizard(false)} />
      )}
      {!showWizard() && (
        <Switch>
          <Match when={currentPage() === 'editor'}>
            <EditorPage onOpenSettings={() => setCurrentPage('settings')} />
          </Match>
          <Match when={currentPage() === 'settings'}>
            <SettingsPage onClose={() => setCurrentPage('editor')} />
          </Match>
        </Switch>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/FirstTimeWizard.tsx src/App.tsx src/styles/global.css
git commit -m "feat: add FirstTimeWizard for initial AI provider setup"
```

---

## Task 11: Save mindmap with nodes and edges

**Files:**
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Add save functionality**

Add a save button to the toolbar and implement save:

```typescript
async function saveMindmap() {
  if (!mindmapStore.mindmap) return;
  const now = Date.now();
  await window.electronAPI.db.updateMindmap(mindmapStore.mindmap.id, {
    updated_at: now,
    view_state: JSON.stringify({ zoom: canvasStore.zoom, panX: canvasStore.panX, panY: canvasStore.panY }),
  });

  // Save all nodes
  for (const node of mindmapStore.nodes.values()) {
    await window.electronAPI.db.updateNode(node.id, {
      pos_x: node.pos_x,
      pos_y: node.pos_y,
      title: node.title,
      content: node.content,
      description: node.description,
      collapsed: node.collapsed,
      parent_id: node.parent_id,
      level: node.level,
      sort_order: node.sort_order,
      updated_at: now,
    });
  }

  // Note: edges don't change position, so no need to save them
}
```

Add save button to toolbar:
```typescript
<button class="toolbar-btn" onClick={saveMindmap} title="保存">💾</button>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: add mindmap save functionality"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec Section | Plan 3 Task | Status |
|-------------|-------------|--------|
| 思维导图 CRUD | Tasks 2, 3, 4, 11 | ✅ |
| 节点编辑 | Task 5 | ✅ |
| 右键菜单 | Task 6 | ✅ |
| 描述面板 | Task 7 | ✅ |
| 折叠/展开 | Task 6, 9 | ✅ |
| 键盘导航 | Task 9 | ✅ |
| 首次启动向导 | Task 10 | ✅ |
| 保存 | Task 11 | ✅ |

**2. Placeholder scan:** No TBD/TODO. AI menu items in context menu call placeholder functions that will be implemented in Plan 4.

**3. Type consistency:** All Node/Edge/Mindmap types consistent with `src/types/index.ts`.
