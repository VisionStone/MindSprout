# 思维芽 (MindSprout) 技术设计文档

> **版本**：v1.0  
> **日期**：2026-05-22  
> **状态**：待审核  

---

## 1. 概述

本文档是 [PRD.md](../../PRD.md) 的技术实现设计，基于以下关键约束：

- **纯桌面应用**：Electron + SolidJS + TypeScript，非浏览器应用
- **纯本地**：无用户账户系统，所有数据本地存储
- **完整实现 PRD v1.0**：除跨端适配和账户系统外，其余功能全部实现
- **AI 可配置**：用户通过设置面板配置任意服务商，使用 Llumiverse 统一调用

---

## 2. 技术栈

| 层级 | 技术 | 说明 |
|-----|------|------|
| 桌面框架 | **Electron** | 主进程 Node.js + 渲染进程 Chromium |
| 前端框架 | **SolidJS** + TypeScript | 响应式 UI，信号驱动状态管理 |
| 构建工具 | **Vite** | 前端打包，Electron 集成 |
| 数据存储 | **SQLite** (`better-sqlite3`) | 本地关系型数据库 |
| 文本布局 | **Pretext** (`@chenglou/pretext`) | Canvas 2D 文本测量与换行 |
| AI 统一层 | **Llumiverse** (`@llumiverse/core` + `@llumiverse/drivers`) | 多厂商 LLM 统一接口 |
| 布局算法 | **dagre** + **d3-force** | 层级布局、力导向布局 |
| 绘图 | **原生 Canvas 2D API** | 节点/连线渲染，视口裁剪 |

---

## 3. 整体架构

### 3.1 Electron 三层职责划分

```
┌─────────────────────────────────────────────────────────────┐
│  渲染进程 (Chromium)                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  SolidJS UI  │  │ Canvas 引擎  │  │ 状态管理层       │  │
│  │  - 页面路由  │  │ - 节点渲染   │  │ - createStore    │  │
│  │  - 弹窗/面板 │  │ - 连线绘制   │  │ - IPC 调用封装   │  │
│  │  - 设置面板  │  │ - 交互处理   │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                    ↓ IPC (contextBridge)                    │
├─────────────────────────────────────────────────────────────┤
│  预加载脚本 (Preload)                                       │
│  - 暴露受控 API 到 window.electronAPI                       │
│  - 禁止直接访问 Node.js / require                           │
├─────────────────────────────────────────────────────────────┤
│  主进程 (Node.js)                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ better-sqlite│  │ Llumiverse   │  │ 安全存储         │  │
│  │ - 导图/节点  │  │ - AI 驱动    │  │ - safeStorage    │  │
│  │ - 任务记录   │  │ - 流式响应   │  │ - 配置文件       │  │
│  │ - 搜索索引   │  │ - 结构化输出 │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 关键原则

1. **渲染进程零 Node.js 访问**：所有文件/数据库/网络操作走 IPC，安全可控。
2. **主进程无业务状态**：主进程只处理请求-响应，不维护业务状态，状态全在 SolidJS Store。
3. **AI 调用在主进程**：API Key 不出渲染进程，流式响应通过 IPC 推送。
4. **Canvas 是唯一的渲染真相源**：所有节点/连线的视觉表现由 Canvas 2D 绘制，HTML 仅用于文本编辑 overlay。

---

## 4. 数据模型 (SQLite Schema)

### 4.1 完整 Schema

```sql
-- 思维导图
CREATE TABLE mindmaps (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    visibility      TEXT DEFAULT 'private' CHECK(visibility IN ('public','private')),
    layout_mode     TEXT DEFAULT 'hierarchical' CHECK(layout_mode IN ('hierarchical','radial','force')),
    view_state      TEXT DEFAULT '{"zoom":1,"panX":0,"panY":0}',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    version         INTEGER DEFAULT 1
);

-- 节点
CREATE TABLE nodes (
    id              TEXT PRIMARY KEY,
    mindmap_id      TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    parent_id       TEXT REFERENCES nodes(id) ON DELETE CASCADE,
    node_type       TEXT DEFAULT 'branch' CHECK(node_type IN ('root','branch','leaf')),
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT DEFAULT '',
    description     TEXT DEFAULT '',
    style           TEXT DEFAULT '{}',
    pos_x           REAL DEFAULT 0,
    pos_y           REAL DEFAULT 0,
    level           INTEGER DEFAULT 0,
    sort_order      INTEGER DEFAULT 0,
    collapsed       INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- 连线
CREATE TABLE edges (
    id              TEXT PRIMARY KEY,
    mindmap_id      TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    source_node_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type       TEXT DEFAULT 'default',
    style           TEXT DEFAULT '{}',
    created_at      INTEGER NOT NULL
);

-- AI 任务
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,
    task_type       TEXT NOT NULL CHECK(task_type IN ('generate','expand','enrich')),
    status          TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','stopped','restarting')),
    progress        INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    input_params    TEXT DEFAULT '{}',
    result          TEXT DEFAULT '{}',
    error_message   TEXT DEFAULT '',
    mindmap_id      TEXT REFERENCES mindmaps(id) ON DELETE SET NULL,
    node_id         TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    completed_at    INTEGER
);

-- AI 服务商配置
CREATE TABLE ai_providers (
    id              TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL,
    provider_type   TEXT NOT NULL CHECK(provider_type IN ('openai','anthropic','deepseek','qwen','custom')),
    api_key         TEXT NOT NULL,
    base_url        TEXT DEFAULT '',
    model_id        TEXT NOT NULL,
    temperature     REAL DEFAULT 0.7,
    max_tokens      INTEGER DEFAULT 4096,
    is_default      INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL
);

-- 应用设置
CREATE TABLE app_settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);
```

### 4.2 设计说明

- `visibility` 保留以满足 PRD 完整实现要求，纯本地场景下作为"是否允许导出分享"的标记。
- 所有外键设 `ON DELETE CASCADE`，删除导图时自动清理节点和连线。
- 任务表记录所有 AI 操作历史，支持停止/重启/删除。
- `view_state` 和 `style` 用 JSON 文本存储，避免过度 schema 化。
- `api_key` 在主进程中用 Electron `safeStorage` 加密后存入 SQLite。

---

## 5. 前端应用结构

### 5.1 页面与组件树

```
App
├── EditorPage          ← 默认入口，全屏画布
│   ├── Toolbar         ← 左侧悬浮工具栏
│   ├── Canvas
│   │   ├── MindMapRenderer (Canvas 2D)
│   │   │   ├── NodeRenderer
│   │   │   └── EdgeRenderer
│   │   └── Minimap     ← 右下角缩略图 (独立 Canvas)
│   ├── NodeEditDialog
│   ├── NodeContextMenu
│   ├── DescriptionPanel
│   └── MindMapListModal
├── SettingsPage
│   ├── AIProviderSettings
│   └── AppearanceSettings
└── FirstTimeWizard     ← 首次启动引导配置 AI
```

### 5.2 SolidJS Store 分层

```typescript
// appStore — 全局 UI 状态
interface AppStore {
  theme: 'light' | 'dark';
  currentMindmapId: string | null;
  showListModal: boolean;
  showNotification: boolean;
  showSettings: boolean;
}

// canvasStore — 画布交互状态
interface CanvasStore {
  zoom: number;
  panX: number;
  panY: number;
  selectedNodeIds: Set<string>;
  draggingNodeId: string | null;
  hoverNodeId: string | null;
}

// mindmapStore — 当前导图数据（内存中的完整树）
interface MindmapStore {
  mindmap: Mindmap | null;
  nodes: Map<string, Node>;     // 以 id 为 key，O(1) 查询
  edges: Map<string, Edge>;
}

// taskStore — AI 任务
interface TaskStore {
  tasks: Task[];
  activeTaskIds: Set<string>;
}
```

### 5.3 IPC 封装层 (Preload)

```typescript
window.electronAPI = {
  // 数据操作
  db: {
    listMindmaps, getMindmap, createMindmap, updateMindmap, deleteMindmap,
    getNodes, createNode, updateNode, deleteNode, updateNodePositions,
    getEdges, createEdge, deleteEdge,
    searchMindmaps
  },
  // AI 服务
  ai: {
    startTask, stopTask, restartTask, deleteTask,
    getTasks, testProviderConnection
  },
  // 设置
  settings: {
    getSetting, setSetting,
    getProviders, saveProvider, deleteProvider
  },
  // 主题
  theme: { getSystemTheme },
  // 事件监听
  onTaskProgress: (callback) => ipcRenderer.on('task:progress', callback),
  onTaskComplete: (callback) => ipcRenderer.on('task:complete', callback),
  onTaskError: (callback) => ipcRenderer.on('task:error', callback)
}
```

---

## 6. 画布编辑器架构

### 6.1 渲染方案：Canvas 2D + Pretext

采用 **Canvas 2D 主渲染 + HTML 编辑 Overlay** 方案，解决大规模节点的 DOM 性能问题。

```
CanvasEditor
├── MainCanvas (HTML5 Canvas 2D, 全屏)
│   ├── 渲染循环 (requestAnimationFrame)
│   │   ├── 1. 视口裁剪（AABB 检测）
│   │   ├── 2. 绘制连线（贝塞尔 path）
│   │   ├── 3. 绘制节点（圆角矩形 + Pretext 排版文字）
│   │   └── 4. 绘制选区高亮 + 折叠按钮
│   └── 脏矩形优化：仅变化区域重绘
├── EditorOverlay (div, absolute, 仅编辑时显示)
│   └── textarea / rich text editor
├── ContextMenu (div, absolute)
├── DescriptionPanel (div, absolute)
└── MinimapCanvas (独立小 canvas)
```

### 6.2 Pretext 文本渲染流程

```typescript
// 1. 准备阶段（节点数据变化时执行一次）
const nodePrepared = prepareWithSegments(
  node.title,
  `bold ${fontSize}px "Inter"`,
  { whiteSpace: 'normal', wordBreak: 'keep-all' }
);

// 2. 布局阶段（节点宽度变化时执行）
const { lines: titleLines } = layoutWithLines(nodePrepared, NODE_MAX_WIDTH, lineHeight);

// 3. 计算节点尺寸
node.width = Math.max(MIN_NODE_WIDTH, maxLineWidth(titleLines) + HORIZONTAL_PADDING * 2);
node.height = VERTICAL_PADDING + titleLines.length * lineHeight +
              (contentLines.length > 0 ? CONTENT_GAP + contentLines.length * contentLineHeight : 0) +
              VERTICAL_PADDING;

// 4. 绘制阶段（每帧）
function drawNode(ctx: CanvasRenderingContext2D, node: Node) {
  // 背景
  ctx.fillStyle = getLevelColor(node.level);
  roundRect(ctx, node.pos_x, node.pos_y, node.width, node.height, BORDER_RADIUS);
  ctx.fill();

  // 标题文字
  ctx.fillStyle = '#fff';
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i].text, node.pos_x + HORIZONTAL_PADDING, node.pos_y + VERTICAL_PADDING + i * lineHeight);
  }

  // 折叠按钮
  if (hasChildren(node)) drawCollapseButton(ctx, node);
}
```

### 6.3 性能策略

1. **视口裁剪**：每帧只遍历视口内的节点（世界坐标 AABB 检测）。
2. **脏矩形重绘**：节点拖拽时只重绘该节点及其关联连线。
3. **离屏缓存**：节点外观缓存到离屏 canvas，内容不变时直接 `drawImage`。
4. **快速缩放降采样**：滚轮缩放过程中用低分辨率绘制，停止 100ms 后重绘高清。
5. **LOD（细节层次）**：缩放到 < 0.3 时，节点只画彩色方块 + 标题前几个字。

### 6.4 命中检测 (Hit Testing)

```typescript
function hitTest(screenX: number, screenY: number): string | null {
  const wx = (screenX - panX) / zoom;
  const wy = (screenY - panY) / zoom;
  // 从后往前遍历可见节点，返回第一个命中的
  for (let i = visibleNodes.length - 1; i >= 0; i--) {
    if (pointInNode(wx, wy, visibleNodes[i])) return visibleNodes[i].id;
  }
  return null;
}
```

### 6.5 交互状态机

| 状态 | 触发 | 行为 |
|-----|------|------|
| `idle` | 空白处 mousedown | 进入 `panning` |
| `idle` | 节点 mousedown | 进入 `dragging-node` |
| `panning` | mousemove | 更新 `canvasStore.panX/Y` |
| `dragging-node` | mousemove | 更新节点 `pos_x/y`（即时反馈） |
| `dragging-node` | 拖到另一节点上 | 显示高亮指示器，mouseup 触发 reparent |
| `dragging-node` | mouseup on empty | 仅更新位置，批量 IPC 保存 |
| `reparenting` | 确认 | 更新 `parent_id` 和 `sort_order`，重新布局子树 |

### 6.6 布局算法

| 模式 | 实现 | 用途 |
|-----|------|------|
| **层级布局** | `dagre` | 默认，整齐清晰 |
| **径向布局** | 自研极坐标算法 | 展示发散思维 |
| **力导向布局** | `d3-force` | 探索性浏览 |

### 6.7 键盘导航

- `↑ / ↓ / ← / →`：空间最近邻查找（基于节点中心点距离）
- `+`：展开当前选中节点
- `-`：折叠当前选中节点
- `空格`：切换当前节点描述浮层
- `Del / Backspace`：删除选中节点（批量）

---

## 7. AI 服务抽象层 (Llumiverse)

### 7.1 架构

```
渲染进程 (SolidJS)
  ↓ ipcRenderer.invoke('ai:start', taskParams)
主进程 (Node.js)
  ↓ TaskService.create(task) → 记录 SQLite
  ↓ AIService.execute(task)
    ├─ 读取用户配置的 provider
    ├─ 动态实例化 Llumiverse Driver
    │   ├─ OpenAIDriver({ apiKey })
    │   ├─ OpenAICompatibleDriver({ apiKey, baseURL })  ← 国内厂商通吃
    │   ├─ AnthropicDriver({ apiKey })
    │   └─ ...按需扩展
    ↓ driver.execute(prompt, { model, temperature, result_schema })
  ↓ 流式响应
    ipcRenderer.send('task:progress', { taskId, chunk })
    ipcRenderer.send('task:complete', { taskId, result })
```

### 7.2 用户配置 → Llumiverse Driver 映射

```typescript
function createDriver(config: AIProviderConfig): Driver {
  const apiKey = safeStorage.decryptString(config.api_key);
  switch (config.provider_type) {
    case 'openai':
      return new OpenAIDriver({ apiKey });
    case 'anthropic':
      return new AnthropicDriver({ apiKey });
    case 'deepseek':
    case 'qwen':
    case 'custom':
      return new OpenAICompatibleDriver({ apiKey, baseURL: config.base_url });
    default:
      throw new Error(`Unsupported provider: ${config.provider_type}`);
  }
}
```

### 7.3 提示词模板与结构化输出

所有 AI 任务要求返回 JSON，避免自然语言解析：

```typescript
const SYSTEM_PROMPTS = {
  generate: `你是一个思维导图生成专家。根据用户给定的主题，生成一个结构化的思维导图。
输出必须是合法的 JSON，格式如下：
{
  "nodes": [
    { "title": "节点标题", "content": "简短描述", "children": [...] }
  ]
}
最多生成 3 层深度，每个父节点下最多 5 个子节点。`,
  expand: `为给定节点生成 3-5 个相关子节点。输出 JSON 格式：
{ "nodes": [{ "title": "...", "content": "..." }] }`,
  enrich: `为给定节点生成详细说明，使用 Markdown 格式。直接输出 Markdown 文本。`
};

const response = await driver.execute(prompt, {
  model: providerConfig.model_id,
  temperature: providerConfig.temperature,
  max_tokens: providerConfig.max_tokens,
  result_schema: MINDMAP_JSON_SCHEMA  // Llumiverse 自动适配不同厂商
});
```

### 7.4 流式响应与中断

```typescript
const abortController = new AbortController();
activeControllers.set(taskId, abortController);

const stream = await driver.stream(prompt, {
  model,
  temperature,
  signal: abortController.signal
});

for await (const chunk of stream) {
  mainWindow.webContents.send('task:progress', { taskId, chunk });
}
```

用户点击"停止"时调用 `abortController.abort()`，捕获 `AbortError` 后将任务状态设为 `stopped`。

---

## 8. 任务与通知系统

### 8.1 任务生命周期

```
pending → running → completed
   ↑         ↓
restarting  stopped → failed
```

### 8.2 任务与 AI 的关系

- 每个 AI 操作（生成/扩展/补充描述）触发一个 Task 记录。
- Task 是追踪层，实际 AI 调用由 `AIService` 执行。
- 任务状态/进度/结果通过 IPC 实时推送到渲染进程。

### 8.3 通知中心

- 左侧悬浮工具栏的铃铛图标，点击展开通知面板。
- 按时间倒序展示最近任务，每个卡片显示类型图标、状态标签、进度条。
- 操作按钮：停止（运行中）、重启（已停止/失败）、删除（已完成）。

### 8.4 任务清理

- 已完成/已停止的任务可手动删除。
- 可配置"保留最近 50 条"自动清理策略。
- 失败任务保留错误信息，方便排查。

---

## 9. 设置与配置

### 9.1 设置页面结构

```
SettingsPage
├── AI Providers
│   ├── ProviderList
│   └── ProviderForm (添加/编辑)
├── Appearance
│   ├── Theme (light/dark)
│   ├── Node Color Scheme
│   └── Default Layout Mode
├── Editor
│   ├── Auto-save Interval
│   ├── Default Zoom Level
│   └── Keyboard Shortcuts Reference
└── Data
    ├── Export All (JSON backup)
    ├── Import
    └── Storage Location
```

### 9.2 AI 服务商配置表单

```typescript
interface ProviderFormData {
  display_name: string;
  provider_type: 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'custom';
  api_key: string;
  base_url: string;
  model_id: string;
  temperature: number;   // 0.0 - 2.0
  max_tokens: number;
  is_default: boolean;
}
```

### 9.3 安全设计

- **API Key 加密**：Electron `safeStorage.encryptString()` 加密后存 SQLite。
- **即时验证**：保存配置时发送测试请求验证连接。
- **多配置共存**：用户可同时配置多个服务商，使用时下拉选择。
- **默认配置**：`is_default=1` 的配置作为默认 AI。

---

## 10. 数据流与 IPC 通信

### 10.1 核心数据流

```
用户操作 → SolidJS Store 更新 → Canvas 重绘
                ↓
         IPC 调用（异步）
                ↓
         主进程 → SQLite 持久化
                ↓
         IPC 响应 → Store 更新（如有需要）
```

### 10.2 批量 IPC 策略

- **节点位置更新**：拖拽结束或布局计算后，批量发送所有变动节点的位置，减少 IPC 往返。
- **Optimistic UI**：AI 扩展节点时，先在 Store 中显示占位节点，流式接收后替换。

### 10.3 关键 IPC 通道

| 通道 | 方向 | 用途 |
|-----|------|------|
| `db:*` | 双向 | 数据库 CRUD 操作 |
| `ai:start` | 渲染 → 主 | 启动 AI 任务 |
| `ai:stop` | 渲染 → 主 | 中断 AI 任务 |
| `task:progress` | 主 → 渲染 | 流式进度推送 |
| `task:complete` | 主 → 渲染 | 任务完成通知 |
| `task:error` | 主 → 渲染 | 任务失败通知 |
| `settings:*` | 双向 | 设置读写 |

---

## 11. 错误处理

### 11.1 分层错误策略

| 层级 | 错误类型 | 处理方式 |
|-----|---------|---------|
| **AI 调用** | API 超时/限流/无效 Key | 捕获异常 → 任务状态设为 `failed` → 显示友好错误信息 |
| **AI 调用** | 用户主动停止 | `AbortController.abort()` → 状态 `stopped` |
| **AI 调用** | JSON 解析失败 | 回退到自然语言提取，或提示用户重试 |
| **数据库** | 写入失败 | 显示保存失败提示，数据保留在内存中，允许用户重试 |
| **Canvas** | 渲染异常 | 捕获并记录日志，不阻塞交互，尝试下一帧恢复 |
| **IPC** | 通信超时 | 3 秒超时后显示网络/进程异常提示 |

### 11.2 日志

- 主进程使用 `electron-log` 记录到本地文件。
- 日志级别：error、warn、info、debug。
- 日志文件轮转，保留最近 7 天。

---

## 12. 安全考虑

1. **API Key 加密存储**：使用 Electron `safeStorage`，调用 OS 原生 keychain（macOS Keychain、Windows DPAPI、Linux Secret Service）。
2. **渲染进程隔离**：预加载脚本严格限制暴露的 API，禁止 `contextIsolation: false`。
3. **无远程代码**：`nodeIntegration: false`，不从网络加载任何可执行代码。
4. **输入校验**：所有用户输入（节点标题、描述、配置项）在渲染进程和主进程双重校验。
5. **SQLite 注入防护**：所有数据库操作使用参数化查询。

---

## 13. 未来扩展预留

以下功能不在 v1.0 范围内，但设计时已预留扩展点：

- **多人协同**：`mindmaps` 表预留 `version` 字段，未来可接入冲突解决。
- **导出功能**：Canvas 渲染器可直接输出 `toDataURL()` 生成图片，PDF 导出可通过 `html2canvas` + `jsPDF` 实现。
- **模板市场**：`mindmaps` 表 `visibility` 字段配合导出/分享功能可扩展为社区。
- **语音输入**：预留语音转文本接口，接入 Web Speech API 或 Whisper。

---

## 14. 修订记录

| 版本 | 日期 | 修订内容 |
|-----|------|---------|
| v1.0 | 2026-05-22 | 初始版本 |
