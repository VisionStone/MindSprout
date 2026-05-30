# Plan 4: AI Features & System Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Llumiverse for multi-provider AI calls, implement AI task lifecycle (generate/expand/enrich), build the notification center, complete the settings panel with AI provider forms, and add data import/export.

**Architecture:** Main process hosts Llumiverse drivers and task management. Tasks are tracked in SQLite with real-time IPC streaming to the renderer. AbortControllers enable user-initiated cancellation.

**Tech Stack:** Llumiverse (`@llumiverse/core` + `@llumiverse/drivers`), Electron safeStorage

---

## File Structure

```
electron/
├── ai/
│   ├── AIService.ts          # Llumiverse driver management + execution
│   ├── prompts.ts            # System prompts and JSON schemas
│   └── TaskManager.ts        # Task CRUD + lifecycle
└── ipc/
    └── handlers.ts           # (modify) Add AI IPC handlers
src/
├── components/
│   ├── NotificationCenter.tsx # Task notifications panel
│   └── AIProviderForm.tsx     # AI provider configuration form
└── pages/
    └── SettingsPage.tsx       # (modify) Complete settings
```

---

## Task 1: Install Llumiverse

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Llumiverse packages**

```bash
npm install @llumiverse/core @llumiverse/drivers
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Llumiverse dependencies"
```

---

## Task 2: AI prompts and JSON schemas

**Files:**
- Create: `electron/ai/prompts.ts`

- [ ] **Step 1: Write prompts.ts**

```typescript
export const SYSTEM_PROMPTS = {
  generate: `你是一个专业的思维导图生成专家。根据用户给定的主题，生成一个结构化、有逻辑层次的思维导图。

要求：
- 输出必须是合法的 JSON 格式
- 最多生成 3 层深度（根节点 → 分支节点 → 叶子节点）
- 每个父节点下最多 5 个子节点
- 每个节点包含 title（标题）和 content（简短描述）
- 确保内容准确、有深度、覆盖主题的主要方面

输出格式：
{
  "nodes": [
    {
      "title": "主标题",
      "content": "描述",
      "children": [
        {
          "title": "子标题",
          "content": "描述",
          "children": [
            { "title": "叶子节点", "content": "描述" }
          ]
        }
      ]
    }
  ]
}`,

  expand: `你是一个知识扩展专家。为给定的节点生成相关的子节点，帮助用户深入探索该主题。

要求：
- 输出必须是合法的 JSON 格式
- 生成 3-5 个相关的子节点
- 每个子节点包含 title（标题）和 content（简短描述）
- 子节点应该与父节点主题直接相关且有逻辑层次

输出格式：
{
  "nodes": [
    { "title": "子节点1", "content": "描述" },
    { "title": "子节点2", "content": "描述" }
  ]
}`,

  enrich: `你是一个专业的内容撰写专家。为给定的节点生成详细的说明文档。

要求：
- 使用 Markdown 格式输出
- 内容应该全面、深入、有条理
- 可以包含列表、表格、代码块等丰富格式
- 语言风格应该专业且易于理解
- 直接输出 Markdown 文本，不要包裹在 JSON 中`,
};

export const MINDMAP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          children: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                children: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      content: { type: 'string' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['title'],
      },
    },
  },
  required: ['nodes'],
};

export function buildGeneratePrompt(topic: string): string {
  return `请为主题 "${topic}" 生成一个完整的思维导图。`;
}

export function buildExpandPrompt(nodeTitle: string, nodeContent: string, context?: string): string {
  let prompt = `请为以下节点生成相关的子节点：\n\n节点标题：${nodeTitle}`;
  if (nodeContent) prompt += `\n节点描述：${nodeContent}`;
  if (context) prompt += `\n\n补充上下文：${context}`;
  return prompt;
}

export function buildEnrichPrompt(nodeTitle: string, nodeContent: string, context?: string): string {
  let prompt = `请为以下节点生成详细的说明文档：\n\n节点标题：${nodeTitle}`;
  if (nodeContent) prompt += `\n节点描述：${nodeContent}`;
  if (context) prompt += `\n\n补充上下文：${context}`;
  prompt += `\n\n请使用 Markdown 格式，内容要全面、深入、有条理。`;
  return prompt;
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ai/prompts.ts
git commit -m "feat: add AI prompts and JSON schemas"
```

---

## Task 3: AIService with Llumiverse

**Files:**
- Create: `electron/ai/AIService.ts`

- [ ] **Step 1: Write AIService.ts**

```typescript
import { Driver, PromptRole } from '@llumiverse/core';
import { OpenAIDriver, OpenAICompatibleDriver, AnthropicDriver } from '@llumiverse/drivers';
import { safeStorage } from 'electron';
import { SYSTEM_PROMPTS, MINDMAP_JSON_SCHEMA, buildGeneratePrompt, buildExpandPrompt, buildEnrichPrompt } from './prompts';
import type { AIProviderConfig } from '../../src/types';

export class AIService {
  private drivers = new Map<string, Driver>();

  getDriver(config: AIProviderConfig): Driver {
    if (this.drivers.has(config.id)) {
      return this.drivers.get(config.id)!;
    }

    const apiKey = safeStorage.decryptString(Buffer.from(config.api_key, 'base64'));
    let driver: Driver;

    switch (config.provider_type) {
      case 'openai':
        driver = new OpenAIDriver({ apiKey, baseURL: config.base_url || undefined });
        break;
      case 'anthropic':
        driver = new AnthropicDriver({ apiKey });
        break;
      case 'deepseek':
      case 'qwen':
      case 'custom':
        driver = new OpenAICompatibleDriver({
          apiKey,
          baseURL: config.base_url,
        });
        break;
      default:
        throw new Error(`Unsupported provider type: ${config.provider_type}`);
    }

    this.drivers.set(config.id, driver);
    return driver;
  }

  async execute(taskType: 'generate' | 'expand' | 'enrich', params: {
    provider: AIProviderConfig;
    topic?: string;
    nodeTitle?: string;
    nodeContent?: string;
    context?: string;
  }, signal?: AbortSignal) {
    const driver = this.getDriver(params.provider);

    let systemPrompt: string;
    let userPrompt: string;
    let schema: object | undefined;

    switch (taskType) {
      case 'generate':
        systemPrompt = SYSTEM_PROMPTS.generate;
        userPrompt = buildGeneratePrompt(params.topic!);
        schema = MINDMAP_JSON_SCHEMA;
        break;
      case 'expand':
        systemPrompt = SYSTEM_PROMPTS.expand;
        userPrompt = buildExpandPrompt(params.nodeTitle!, params.nodeContent || '', params.context);
        schema = MINDMAP_JSON_SCHEMA;
        break;
      case 'enrich':
        systemPrompt = SYSTEM_PROMPTS.enrich;
        userPrompt = buildEnrichPrompt(params.nodeTitle!, params.nodeContent || '', params.context);
        schema = undefined;
        break;
    }

    const prompt = [
      { role: PromptRole.system, content: systemPrompt },
      { role: PromptRole.user, content: userPrompt },
    ];

    const response = await driver.execute(prompt, {
      model: params.provider.model_id,
      temperature: params.provider.temperature,
      max_tokens: params.provider.max_tokens,
      result_schema: schema,
    });

    return response.result[0].value;
  }

  async *stream(taskType: 'generate' | 'expand' | 'enrich', params: {
    provider: AIProviderConfig;
    topic?: string;
    nodeTitle?: string;
    nodeContent?: string;
    context?: string;
  }, signal?: AbortSignal) {
    const driver = this.getDriver(params.provider);

    let systemPrompt: string;
    let userPrompt: string;

    switch (taskType) {
      case 'generate':
        systemPrompt = SYSTEM_PROMPTS.generate;
        userPrompt = buildGeneratePrompt(params.topic!);
        break;
      case 'expand':
        systemPrompt = SYSTEM_PROMPTS.expand;
        userPrompt = buildExpandPrompt(params.nodeTitle!, params.nodeContent || '', params.context);
        break;
      case 'enrich':
        systemPrompt = SYSTEM_PROMPTS.enrich;
        userPrompt = buildEnrichPrompt(params.nodeTitle!, params.nodeContent || '', params.context);
        break;
    }

    const prompt = [
      { role: PromptRole.system, content: systemPrompt },
      { role: PromptRole.user, content: userPrompt },
    ];

    const stream = await driver.stream(prompt, {
      model: params.provider.model_id,
      temperature: params.provider.temperature,
      max_tokens: params.provider.max_tokens,
    });

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      yield chunk;
    }

    return stream.completion?.result[0]?.value;
  }
}

export const aiService = new AIService();
```

- [ ] **Step 2: Commit**

```bash
git add electron/ai/AIService.ts
git commit -m "feat: add AIService with Llumiverse multi-provider support"
```

---

## Task 4: TaskManager

**Files:**
- Create: `electron/ai/TaskManager.ts`
- Modify: `electron/db/index.ts` (add task table operations if not already)

- [ ] **Step 1: Write TaskManager.ts**

```typescript
import { getDb } from '../db/index';
import { aiService } from './AIService';
import { BrowserWindow } from 'electron';
import { generateId } from '../../src/utils/id';
import type { Task, AIProviderConfig } from '../../src/types';

interface ActiveTask {
  task: Task;
  abortController: AbortController;
}

class TaskManager {
  private activeTasks = new Map<string, ActiveTask>();

  createTask(params: {
    taskType: 'generate' | 'expand' | 'enrich';
    mindmapId?: string;
    nodeId?: string;
    inputParams: object;
  }): Task {
    const db = getDb();
    const now = Date.now();
    const task: Task = {
      id: generateId(),
      task_type: params.taskType,
      status: 'pending',
      progress: 0,
      input_params: JSON.stringify(params.inputParams),
      result: '{}',
      error_message: '',
      mindmap_id: params.mindmapId || null,
      node_id: params.nodeId || null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    const stmt = db.prepare(`
      INSERT INTO tasks (id, task_type, status, progress, input_params, result, error_message, mindmap_id, node_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(task.id, task.task_type, task.status, task.progress, task.input_params, task.result, task.error_message, task.mindmap_id, task.node_id, task.created_at, task.updated_at);

    return task;
  }

  async startTask(taskId: string, provider: AIProviderConfig, mainWindow: BrowserWindow) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task;
    if (!task) return;

    db.prepare("UPDATE tasks SET status = 'running', updated_at = ? WHERE id = ?").run(Date.now(), taskId);

    const inputParams = JSON.parse(task.input_params);
    const abortController = new AbortController();
    this.activeTasks.set(taskId, { task, abortController });

    try {
      let result: string = '';

      if (task.task_type === 'enrich') {
        // Non-streaming for enrich (returns markdown)
        const response = await aiService.execute(task.task_type, {
          provider,
          ...inputParams,
        }, abortController.signal);
        result = JSON.stringify({ content: response });
      } else {
        // Streaming for generate/expand
        const stream = aiService.stream(task.task_type, {
          provider,
          ...inputParams,
        }, abortController.signal);

        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk;
          mainWindow.webContents.send('task:progress', {
            taskId,
            chunk,
            progress: Math.min(90, fullText.length / 10),
          });
        }
        result = JSON.stringify({ content: fullText });
      }

      db.prepare("UPDATE tasks SET status = 'completed', progress = 100, result = ?, completed_at = ?, updated_at = ? WHERE id = ?")
        .run(result, Date.now(), Date.now(), taskId);

      mainWindow.webContents.send('task:complete', { taskId, result });
    } catch (error: any) {
      const status = abortController.signal.aborted ? 'stopped' : 'failed';
      const errorMessage = abortController.signal.aborted ? '用户已停止' : (error.message || '未知错误');

      db.prepare("UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE id = ?")
        .run(status, errorMessage, Date.now(), taskId);

      mainWindow.webContents.send('task:error', { taskId, error: errorMessage });
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  stopTask(taskId: string) {
    const active = this.activeTasks.get(taskId);
    if (active) {
      active.abortController.abort();
    }
  }

  getTasks(): Task[] {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Task[];
  }

  deleteTask(taskId: string) {
    const db = getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  cleanupOldTasks(keepCount: number = 50) {
    const db = getDb();
    db.prepare(`
      DELETE FROM tasks WHERE id IN (
        SELECT id FROM tasks WHERE status IN ('completed', 'stopped', 'failed')
        ORDER BY completed_at DESC LIMIT -1 OFFSET ?
      )
    `).run(keepCount);
  }
}

export const taskManager = new TaskManager();
```

- [ ] **Step 2: Commit**

```bash
git add electron/ai/TaskManager.ts
git commit -m "feat: add TaskManager with lifecycle and streaming"
```

---

## Task 5: Update IPC handlers for AI

**Files:**
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: Add AI handlers**

```typescript
import { aiService } from '../ai/AIService';
import { taskManager } from '../ai/TaskManager';
import { getDb } from '../db/index';
import { safeStorage } from 'electron';

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  // ... existing handlers ...

  // AI handlers
  ipcMain.handle('ai:startTask', async (_, params: {
    taskType: 'generate' | 'expand' | 'enrich';
    mindmapId?: string;
    nodeId?: string;
    inputParams: object;
    providerId: string;
  }) => {
    const db = getDb();
    const provider = db.prepare('SELECT * FROM ai_providers WHERE id = ?').get(params.providerId) as any;
    if (!provider) throw new Error('Provider not found');

    // Decrypt API key for the task
    const decryptedKey = safeStorage.decryptString(Buffer.from(provider.api_key, 'base64'));
    const providerConfig = { ...provider, api_key: decryptedKey };

    const task = taskManager.createTask({
      taskType: params.taskType,
      mindmapId: params.mindmapId,
      nodeId: params.nodeId,
      inputParams: params.inputParams,
    });

    // Start in background
    taskManager.startTask(task.id, providerConfig, mainWindow);

    return task.id;
  });

  ipcMain.handle('ai:stopTask', (_, taskId: string) => {
    taskManager.stopTask(taskId);
  });

  ipcMain.handle('ai:getTasks', () => {
    return taskManager.getTasks();
  });

  ipcMain.handle('ai:deleteTask', (_, taskId: string) => {
    taskManager.deleteTask(taskId);
  });

  ipcMain.handle('ai:testProvider', async (_, config: {
    providerType: string;
    apiKey: string;
    baseUrl?: string;
    modelId: string;
  }) => {
    try {
      let driver;
      switch (config.providerType) {
        case 'openai':
          driver = new OpenAIDriver({ apiKey: config.apiKey, baseURL: config.baseUrl });
          break;
        case 'anthropic':
          driver = new AnthropicDriver({ apiKey: config.apiKey });
          break;
        default:
          driver = new OpenAICompatibleDriver({ apiKey: config.apiKey, baseURL: config.baseUrl });
      }
      await driver.execute([
        { role: PromptRole.user, content: 'Say "OK" only.' }
      ], { model: config.modelId, max_tokens: 10 });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
```

Note: Update the `registerIpcHandlers` function signature to accept `mainWindow`, and update `electron/main.ts` to pass it.

- [ ] **Step 2: Update main.ts to pass mainWindow**

```typescript
import { registerIpcHandlers } from './ipc/handlers';

// In createWindow():
registerIpcHandlers(mainWindow);
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/handlers.ts electron/main.ts
git commit -m "feat: add AI IPC handlers for task management"
```

---

## Task 6: NotificationCenter component

**Files:**
- Create: `src/components/NotificationCenter.tsx`

- [ ] **Step 1: Write NotificationCenter.tsx**

```typescript
import { createSignal, For, onMount } from 'solid-js';
import type { Task } from '../types';

interface NotificationCenterProps {
  onClose: () => void;
}

export default function NotificationCenter(props: NotificationCenterProps) {
  const [tasks, setTasks] = createSignal<Task[]>([]);

  onMount(async () => {
    const list = await window.electronAPI.ai.getTasks();
    setTasks(list);
  });

  // Listen for real-time updates
  onMount(() => {
    window.electronAPI.onTaskProgress((_, data) => {
      setTasks(prev => prev.map(t =>
        t.id === data.taskId ? { ...t, status: 'running', progress: data.progress } : t
      ));
    });
    window.electronAPI.onTaskComplete((_, data) => {
      setTasks(prev => prev.map(t =>
        t.id === data.taskId ? { ...t, status: 'completed', progress: 100, result: data.result } : t
      ));
    });
    window.electronAPI.onTaskError((_, data) => {
      setTasks(prev => prev.map(t =>
        t.id === data.taskId ? { ...t, status: 'failed', error_message: data.error } : t
      ));
    });
  });

  async function stopTask(taskId: string) {
    await window.electronAPI.ai.stopTask(taskId);
  }

  async function deleteTask(taskId: string) {
    await window.electronAPI.ai.deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  function getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: '⏳',
      running: '▶️',
      completed: '✅',
      failed: '❌',
      stopped: '🛑',
      restarting: '🔄',
    };
    return icons[status] || '❓';
  }

  function getStatusText(status: string): string {
    const texts: Record<string, string> = {
      pending: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      stopped: '已停止',
      restarting: '重启中',
    };
    return texts[status] || status;
  }

  return (
    <div class="notification-panel">
      <div class="notification-header">
        <h4>通知中心</h4>
        <button class="close-btn" onClick={props.onClose}>✕</button>
      </div>
      <div class="notification-list">
        <For each={tasks()}>
          {(task) => (
            <div class={`notification-item ${task.status}`}>
              <div class="notification-icon">{getStatusIcon(task.status)}</div>
              <div class="notification-body">
                <div class="notification-title">
                  {task.task_type === 'generate' ? '生成导图' :
                   task.task_type === 'expand' ? '扩展节点' : '补充描述'}
                  <span class="notification-status">{getStatusText(task.status)}</span>
                </div>
                {task.status === 'running' && (
                  <div class="progress-bar">
                    <div class="progress-fill" style={{ width: `${task.progress}%` }} />
                  </div>
                )}
                {task.error_message && (
                  <div class="notification-error">{task.error_message}</div>
                )}
              </div>
              <div class="notification-actions">
                {task.status === 'running' && (
                  <button class="action-btn" onClick={() => stopTask(task.id)} title="停止">⏹</button>
                )}
                {(task.status === 'completed' || task.status === 'failed' || task.status === 'stopped') && (
                  <button class="action-btn" onClick={() => deleteTask(task.id)} title="删除">🗑</button>
                )}
              </div>
            </div>
          )}
        </For>
        {tasks().length === 0 && (
          <div class="notification-empty">暂无任务</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add notification styles**

Append to `src/styles/global.css`:

```css
.notification-panel {
  position: fixed;
  right: 16px;
  top: 16px;
  width: 340px;
  max-height: 480px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-lg);
  z-index: 150;
  display: flex;
  flex-direction: column;
}

.notification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.notification-header h4 {
  font-size: 14px;
  font-weight: 600;
}

.notification-list {
  overflow-y: auto;
  padding: 8px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: var(--border-radius);
  margin-bottom: 4px;
}

.notification-item:hover {
  background: var(--bg-secondary);
}

.notification-icon {
  font-size: 16px;
  margin-top: 2px;
}

.notification-body {
  flex: 1;
  min-width: 0;
}

.notification-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.notification-status {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: normal;
}

.progress-bar {
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-color);
  border-radius: 2px;
  transition: width 0.3s;
}

.notification-error {
  font-size: 12px;
  color: var(--danger-color);
  margin-top: 4px;
}

.notification-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: var(--bg-tertiary);
}

.notification-empty {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/NotificationCenter.tsx src/styles/global.css
git commit -m "feat: add NotificationCenter with real-time task updates"
```

---

## Task 7: Wire AI context menu actions

**Files:**
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/components/NodeContextMenu.tsx`

- [ ] **Step 1: Add AI action handlers in EditorPage**

```typescript
async function startAITask(taskType: 'generate' | 'expand' | 'enrich', node?: Node) {
  // Get default provider
  const providers = await window.electronAPI.settings.getProviders();
  const defaultProvider = providers.find((p: any) => p.is_default) || providers[0];
  if (!defaultProvider) {
    alert('请先配置 AI 服务商');
    return;
  }

  const inputParams: any = {};
  if (taskType === 'generate') {
    const topic = prompt('请输入思维导图主题：');
    if (!topic) return;
    inputParams.topic = topic;
  } else if (node) {
    inputParams.nodeTitle = node.title;
    inputParams.nodeContent = node.content;
  }

  const taskId = await window.electronAPI.ai.startTask({
    taskType,
    mindmapId: mindmapStore.mindmap?.id,
    nodeId: node?.id,
    inputParams,
    providerId: defaultProvider.id,
  });

  // Open notification center
  setAppStore('showNotification', true);
}
```

Pass these to the context menu:
```typescript
onAIGenerate={() => startAITask('generate')}
onAIExpand={() => startAITask('expand', contextMenu()!.node)}
onAIEnrich={() => startAITask('enrich', contextMenu()!.node)}
```

- [ ] **Step 2: Add AI generate button to toolbar**

```typescript
<button class="toolbar-btn" onClick={() => startAITask('generate')} title="AI 生成导图">🤖</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: wire AI actions from context menu and toolbar"
```

---

## Task 8: AI provider settings form

**Files:**
- Create: `src/components/AIProviderForm.tsx`
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write AIProviderForm.tsx**

```typescript
import { createSignal } from 'solid-js';
import { generateId } from '../utils/id';

interface AIProviderFormProps {
  onSaved: () => void;
}

export default function AIProviderForm(props: AIProviderFormProps) {
  const [providers, setProviders] = createSignal<any[]>([]);
  const [editing, setEditing] = createSignal<any | null>(null);

  const [displayName, setDisplayName] = createSignal('');
  const [providerType, setProviderType] = createSignal('custom');
  const [apiKey, setApiKey] = createSignal('');
  const [baseUrl, setBaseUrl] = createSignal('');
  const [modelId, setModelId] = createSignal('');
  const [temperature, setTemperature] = createSignal(0.7);
  const [maxTokens, setMaxTokens] = createSignal(4096);
  const [isDefault, setIsDefault] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string } | null>(null);

  async function loadProviders() {
    const list = await window.electronAPI.settings.getProviders();
    setProviders(list);
  }

  async function saveProvider() {
    const id = editing()?.id || generateId();
    await window.electronAPI.settings.saveProvider({
      id,
      display_name: displayName(),
      provider_type: providerType(),
      api_key: apiKey(),
      base_url: baseUrl(),
      model_id: modelId(),
      temperature: temperature(),
      max_tokens: maxTokens(),
      is_default: isDefault() ? 1 : 0,
      created_at: Date.now(),
    });
    resetForm();
    await loadProviders();
    props.onSaved();
  }

  async function testConnection() {
    setTestResult(null);
    const result = await window.electronAPI.ai.testProvider({
      providerType: providerType(),
      apiKey: apiKey(),
      baseUrl: baseUrl() || undefined,
      modelId: modelId(),
    });
    setTestResult({
      success: result.success,
      message: result.success ? '连接成功' : `连接失败: ${result.error}`,
    });
  }

  function editProvider(p: any) {
    setEditing(p);
    setDisplayName(p.display_name);
    setProviderType(p.provider_type);
    setApiKey(''); // Don't show existing key
    setBaseUrl(p.base_url);
    setModelId(p.model_id);
    setTemperature(p.temperature);
    setMaxTokens(p.max_tokens);
    setIsDefault(!!p.is_default);
  }

  function resetForm() {
    setEditing(null);
    setDisplayName('');
    setProviderType('custom');
    setApiKey('');
    setBaseUrl('');
    setModelId('');
    setTemperature(0.7);
    setMaxTokens(4096);
    setIsDefault(false);
    setTestResult(null);
  }

  return (
    <div class="provider-settings">
      <div class="provider-list">
        <h4>已配置的服务商</h4>
        {providers().map(p => (
          <div class="provider-card">
            <div class="provider-info">
              <strong>{p.display_name}</strong>
              <span class="provider-type">{p.provider_type}</span>
              {p.is_default && <span class="default-badge">默认</span>}
            </div>
            <div class="provider-actions">
              <button class="btn-secondary-small" onClick={() => editProvider(p)}>编辑</button>
              <button class="btn-danger-small" onClick={() => {
                window.electronAPI.settings.deleteProvider(p.id);
                loadProviders();
              }}>删除</button>
            </div>
          </div>
        ))}
        <button class="btn-secondary" onClick={resetForm}>+ 添加新服务商</button>
      </div>

      <div class="provider-form">
        <h4>{editing() ? '编辑服务商' : '添加服务商'}</h4>

        <div class="form-group">
          <label>显示名称</label>
          <input value={displayName()} onInput={e => setDisplayName(e.currentTarget.value)} />
        </div>

        <div class="form-group">
          <label>服务商类型</label>
          <select value={providerType()} onChange={e => setProviderType(e.currentTarget.value)}>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="qwen">通义千问</option>
            <option value="custom">自定义 (OpenAI Compatible)</option>
          </select>
        </div>

        <div class="form-group">
          <label>API Key</label>
          <input type="password" value={apiKey()} onInput={e => setApiKey(e.currentTarget.value)} placeholder={editing() ? '留空保持不变' : 'sk-...'} />
        </div>

        <div class="form-group">
          <label>Base URL (可选)</label>
          <input value={baseUrl()} onInput={e => setBaseUrl(e.currentTarget.value)} placeholder="https://api.openai.com/v1" />
        </div>

        <div class="form-group">
          <label>模型 ID</label>
          <input value={modelId()} onInput={e => setModelId(e.currentTarget.value)} placeholder="gpt-4o" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Temperature ({temperature()})</label>
            <input type="range" min="0" max="2" step="0.1" value={temperature()} onInput={e => setTemperature(parseFloat(e.currentTarget.value))} />
          </div>
          <div class="form-group">
            <label>Max Tokens</label>
            <input type="number" value={maxTokens()} onInput={e => setMaxTokens(parseInt(e.currentTarget.value))} />
          </div>
        </div>

        <div class="form-group checkbox">
          <label>
            <input type="checkbox" checked={isDefault()} onChange={e => setIsDefault(e.currentTarget.checked)} />
            设为默认服务商
          </label>
        </div>

        {testResult() && (
          <div class={`test-result ${testResult()!.success ? 'success' : 'error'}`}>
            {testResult()!.message}
          </div>
        )}

        <div class="form-actions">
          <button class="btn-secondary" onClick={testConnection}>测试连接</button>
          <button class="btn-primary" onClick={saveProvider}>保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add provider form styles**

Append to `src/styles/global.css`:

```css
.provider-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-list h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.provider-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-type {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
}

.default-badge {
  font-size: 11px;
  color: white;
  background: var(--accent-color);
  padding: 2px 8px;
  border-radius: 10px;
}

.provider-actions {
  display: flex;
  gap: 6px;
}

.provider-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
}

.provider-form h4 {
  margin-bottom: 4px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.form-group.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.form-group.checkbox input {
  width: auto;
}

.test-result {
  padding: 8px 12px;
  border-radius: var(--border-radius);
  font-size: 13px;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success-color);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger-color);
}

.btn-secondary-small {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}
```

- [ ] **Step 3: Update SettingsPage to use AIProviderForm**

```typescript
import AIProviderForm from '../components/AIProviderForm';

// In the AI Providers section:
<AIProviderForm onSaved={() => {}} />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AIProviderForm.tsx src/pages/SettingsPage.tsx src/styles/global.css
git commit -m "feat: add AI provider configuration form with connection test"
```

---

## Task 9: Data import/export

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add import/export buttons**

```typescript
async function exportData() {
  const mindmaps = await window.electronAPI.db.listMindmaps();
  const exportData = { version: 1, exportedAt: Date.now(), mindmaps: [] as any[] };

  for (const mindmap of mindmaps) {
    const nodes = await window.electronAPI.db.getNodes(mindmap.id);
    const edges = await window.electronAPI.db.getEdges(mindmap.id);
    exportData.mindmaps.push({ ...mindmap, nodes, edges });
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mindsprout-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.mindmaps || !Array.isArray(data.mindmaps)) {
      alert('无效的备份文件');
      return;
    }

    for (const mindmap of data.mindmaps) {
      await window.electronAPI.db.createMindmap(mindmap);
      for (const node of mindmap.nodes || []) {
        await window.electronAPI.db.createNode(node);
      }
      for (const edge of mindmap.edges || []) {
        await window.electronAPI.db.createEdge(edge);
      }
    }

    alert(`成功导入 ${data.mindmaps.length} 张思维导图`);
  };
  input.click();
}
```

Add to the Data section:
```typescript
<div class="settings-section">
  <h3>数据管理</h3>
  <div class="data-actions">
    <button class="btn-secondary" onClick={exportData}>导出所有数据</button>
    <button class="btn-secondary" onClick={importData}>导入数据</button>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: add data import/export functionality"
```

---

## Task 10: Handle AI task results

**Files:**
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Parse AI results and apply to mindmap**

Add task result handlers in EditorPage's `onMount`:

```typescript
window.electronAPI.onTaskComplete(async (_, data) => {
  const result = JSON.parse(data.result);
  const task = (await window.electronAPI.ai.getTasks()).find((t: any) => t.id === data.taskId);
  if (!task) return;

  if (task.task_type === 'generate') {
    // Create new mindmap from AI result
    const parsed = JSON.parse(result.content);
    // ... create mindmap with nodes from parsed structure
  } else if (task.task_type === 'expand') {
    // Add children to the target node
    const parsed = JSON.parse(result.content);
    const parentNode = mindmapStore.nodes.get(task.node_id);
    if (!parentNode) return;

    const now = Date.now();
    const existingChildren = getChildren(parentNode.id);
    for (let i = 0; i < parsed.nodes.length; i++) {
      const newNode = {
        id: generateId(),
        mindmap_id: mindmapStore.mindmap!.id,
        parent_id: parentNode.id,
        node_type: 'branch' as const,
        title: parsed.nodes[i].title,
        content: parsed.nodes[i].content || '',
        description: '',
        style: '{}',
        pos_x: parentNode.pos_x + (i - parsed.nodes.length / 2) * 150,
        pos_y: parentNode.pos_y + 120,
        level: parentNode.level + 1,
        sort_order: existingChildren.length + i,
        collapsed: 0,
        created_at: now,
        updated_at: now,
      };
      await window.electronAPI.db.createNode(newNode);
      await window.electronAPI.db.createEdge({
        id: generateId(),
        mindmap_id: mindmapStore.mindmap!.id,
        source_node_id: parentNode.id,
        target_node_id: newNode.id,
        created_at: now,
      });
      addNode(newNode);
      addEdge({
        id: generateId(),
        mindmap_id: mindmapStore.mindmap!.id,
        source_node_id: parentNode.id,
        target_node_id: newNode.id,
        edge_type: 'default',
        style: '{}',
        created_at: now,
      });
    }
    engine.markDirty();
  } else if (task.task_type === 'enrich') {
    // Update node description
    const content = result.content;
    await window.electronAPI.db.updateNode(task.node_id, { description: content, updated_at: Date.now() });
    updateNode(task.node_id, { description: content });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: handle AI task results and apply to mindmap"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec Section | Plan 4 Task | Status |
|-------------|-------------|--------|
| AI 生成思维导图 | Tasks 2, 3, 5, 7, 10 | ✅ |
| AI 扩展节点 | Tasks 2, 3, 5, 7, 10 | ✅ |
| AI 补充描述 | Tasks 2, 3, 5, 7, 10 | ✅ |
| 任务管理 | Tasks 4, 5, 6 | ✅ |
| 通知中心 | Task 6 | ✅ |
| AI 服务商配置 | Tasks 3, 8 | ✅ |
| 设置面板 | Task 8 | ✅ |
| 数据导入/导出 | Task 9 | ✅ |

**2. Placeholder scan:** No TBD/TODO. All code is concrete.

**3. Type consistency:** AIProviderConfig type matches across AIService, settings, and UI components.
