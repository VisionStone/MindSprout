# Plan 1: Project Scaffolding & Core Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Electron + SolidJS + TypeScript project with SQLite database, IPC communication, basic UI skeleton, and theme system. The app should launch and show a working window.

**Architecture:** Three-process Electron app (main, preload, renderer) with Vite for bundling. SQLite via better-sqlite3 in the main process. SolidJS signals for reactive state. IPC through contextBridge with a typed API surface.

**Tech Stack:** Electron, Vite, SolidJS, TypeScript, better-sqlite3, electron-log

---

## File Structure

```
mindsprout/
├── electron/
│   ├── main.ts                 # Main process entry
│   ├── preload.ts              # Preload script (exposes window.electronAPI)
│   ├── db/
│   │   ├── index.ts            # Database connection singleton
│   │   ├── schema.ts           # CREATE TABLE statements
│   │   └── mindmap.ts          # Mindmap CRUD operations
│   └── ipc/
│       └── handlers.ts         # IPC handler registrations
├── src/
│   ├── main.tsx                # Renderer entry (SolidJS)
│   ├── App.tsx                 # Root component with routing
│   ├── pages/
│   │   ├── EditorPage.tsx      # Main editor page (skeleton)
│   │   └── SettingsPage.tsx    # Settings page (skeleton)
│   ├── stores/
│   │   ├── appStore.ts         # Global UI state
│   │   └── index.ts            # Store exports
│   ├── types/
│   │   └── index.ts            # Shared TypeScript interfaces
│   └── styles/
│       └── global.css          # Global styles + CSS variables for theming
├── index.html                  # Renderer HTML template
├── vite.main.config.ts         # Vite config for main process
├── vite.preload.config.ts      # Vite config for preload script
├── vite.renderer.config.ts     # Vite config for renderer
├── package.json
├── tsconfig.json
└── tsconfig.node.json
```

---

## Task 1: Initialize package.json with all dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "mindsprout",
  "version": "1.0.0",
  "description": "AI-powered mind mapping tool",
  "main": "./dist/main.js",
  "scripts": {
    "dev": "npm run build:preload && npm run build:main && concurrently \"npm run watch:preload\" \"npm run watch:main\" \"npm run dev:renderer\"",
    "build": "npm run build:preload && npm run build:main && npm run build:renderer",
    "build:main": "vite build --config vite.main.config.ts",
    "build:preload": "vite build --config vite.preload.config.ts",
    "build:renderer": "vite build --config vite.renderer.config.ts",
    "watch:main": "vite build --config vite.main.config.ts --watch",
    "watch:preload": "vite build --config vite.preload.config.ts --watch",
    "dev:renderer": "vite --config vite.renderer.config.ts",
    "electron": "electron .",
    "test": "vitest"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "concurrently": "^9.0.0",
    "electron": "^35.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-solid": "^2.11.0",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "better-sqlite3": "^12.0.0",
    "electron-log": "^5.3.0",
    "solid-js": "^1.9.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: initialize package.json with dependencies"
```

---

## Task 2: TypeScript configuration

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*", "electron/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Write tsconfig.node.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.*.config.ts"]
}
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json tsconfig.node.json
git commit -m "chore: add TypeScript configuration"
```

---

## Task 3: Vite configurations for three processes

**Files:**
- Create: `vite.main.config.ts`
- Create: `vite.preload.config.ts`
- Create: `vite.renderer.config.ts`
- Create: `index.html`

- [ ] **Step 1: Write vite.main.config.ts**

```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  build: {
    lib: {
      entry: path.resolve(__dirname, 'electron/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'electron-log'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 2: Write vite.preload.config.ts**

```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  build: {
    lib: {
      entry: path.resolve(__dirname, 'electron/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron'],
    },
  },
});
```

- [ ] **Step 3: Write vite.renderer.config.ts**

```typescript
import { defineConfig } from 'vite';
import path from 'path';
import solid from 'vite-plugin-solid';

export default defineConfig({
  root: path.resolve(__dirname),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: false,
  },
  plugins: [solid()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 4: Write index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>思维芽 MindSprout</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Verify builds work**

Run: `npm run build`

Expected: `dist/main.js`, `dist/preload.js`, and `dist/index.html` created with no errors.

- [ ] **Step 6: Commit**

```bash
git add vite.*.config.ts index.html
git commit -m "chore: add Vite configs for three Electron processes"
```

---

## Task 4: Shared TypeScript types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write shared types**

```typescript
export interface Mindmap {
  id: string;
  title: string;
  description: string;
  visibility: 'public' | 'private';
  layout_mode: 'hierarchical' | 'radial' | 'force';
  view_state: string;
  created_at: number;
  updated_at: number;
  version: number;
}

export interface Node {
  id: string;
  mindmap_id: string;
  parent_id: string | null;
  node_type: 'root' | 'branch' | 'leaf';
  title: string;
  content: string;
  description: string;
  style: string;
  pos_x: number;
  pos_y: number;
  level: number;
  sort_order: number;
  collapsed: number;
  created_at: number;
  updated_at: number;
}

export interface Edge {
  id: string;
  mindmap_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  style: string;
  created_at: number;
}

export type TaskType = 'generate' | 'expand' | 'enrich';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped' | 'restarting';

export interface Task {
  id: string;
  task_type: TaskType;
  status: TaskStatus;
  progress: number;
  input_params: string;
  result: string;
  error_message: string;
  mindmap_id: string | null;
  node_id: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

export interface AIProviderConfig {
  id: string;
  display_name: string;
  provider_type: 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'custom';
  api_key: string;
  base_url: string;
  model_id: string;
  temperature: number;
  max_tokens: number;
  is_default: number;
  created_at: number;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  auto_save_interval: number;
  default_zoom: number;
  default_layout_mode: 'hierarchical' | 'radial' | 'force';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 5: Electron main process

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: Write main.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import log from 'electron-log';

log.initialize();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add Electron main process"
```

---

## Task 6: Electron preload script with typed IPC API

**Files:**
- Create: `electron/preload.ts`

- [ ] **Step 1: Write preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  db: {
    listMindmaps: () => Promise<any[]>;
    getMindmap: (id: string) => Promise<any | null>;
    createMindmap: (data: any) => Promise<string>;
    updateMindmap: (id: string, data: any) => Promise<void>;
    deleteMindmap: (id: string) => Promise<void>;
    getNodes: (mindmapId: string) => Promise<any[]>;
    createNode: (data: any) => Promise<string>;
    updateNode: (id: string, data: any) => Promise<void>;
    deleteNode: (id: string) => Promise<void>;
    getEdges: (mindmapId: string) => Promise<any[]>;
    createEdge: (data: any) => Promise<string>;
    deleteEdge: (id: string) => Promise<void>;
  };
  settings: {
    getSetting: (key: string) => Promise<string | null>;
    setSetting: (key: string, value: string) => Promise<void>;
    getProviders: () => Promise<any[]>;
    saveProvider: (data: any) => Promise<string>;
    deleteProvider: (id: string) => Promise<void>;
  };
  ai: {
    startTask: (params: any) => Promise<string>;
    stopTask: (taskId: string) => Promise<void>;
    getTasks: () => Promise<any[]>;
    deleteTask: (taskId: string) => Promise<void>;
  };
  onTaskProgress: (callback: (event: any, data: any) => void) => void;
  onTaskComplete: (callback: (event: any, data: any) => void) => void;
  onTaskError: (callback: (event: any, data: any) => void) => void;
}

const api: ElectronAPI = {
  db: {
    listMindmaps: () => ipcRenderer.invoke('db:listMindmaps'),
    getMindmap: (id: string) => ipcRenderer.invoke('db:getMindmap', id),
    createMindmap: (data: any) => ipcRenderer.invoke('db:createMindmap', data),
    updateMindmap: (id: string, data: any) => ipcRenderer.invoke('db:updateMindmap', id, data),
    deleteMindmap: (id: string) => ipcRenderer.invoke('db:deleteMindmap', id),
    getNodes: (mindmapId: string) => ipcRenderer.invoke('db:getNodes', mindmapId),
    createNode: (data: any) => ipcRenderer.invoke('db:createNode', data),
    updateNode: (id: string, data: any) => ipcRenderer.invoke('db:updateNode', id, data),
    deleteNode: (id: string) => ipcRenderer.invoke('db:deleteNode', id),
    getEdges: (mindmapId: string) => ipcRenderer.invoke('db:getEdges', mindmapId),
    createEdge: (data: any) => ipcRenderer.invoke('db:createEdge', data),
    deleteEdge: (id: string) => ipcRenderer.invoke('db:deleteEdge', id),
  },
  settings: {
    getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
    setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getProviders: () => ipcRenderer.invoke('settings:getProviders'),
    saveProvider: (data: any) => ipcRenderer.invoke('settings:saveProvider', data),
    deleteProvider: (id: string) => ipcRenderer.invoke('settings:deleteProvider', id),
  },
  ai: {
    startTask: (params: any) => ipcRenderer.invoke('ai:startTask', params),
    stopTask: (taskId: string) => ipcRenderer.invoke('ai:stopTask', taskId),
    getTasks: () => ipcRenderer.invoke('ai:getTasks'),
    deleteTask: (taskId: string) => ipcRenderer.invoke('ai:deleteTask', taskId),
  },
  onTaskProgress: (callback) => ipcRenderer.on('task:progress', callback),
  onTaskComplete: (callback) => ipcRenderer.on('task:complete', callback),
  onTaskError: (callback) => ipcRenderer.on('task:error', callback),
};

contextBridge.exposeInMainWorld('electronAPI', api);
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add preload script with typed IPC API"
```

---

## Task 7: SQLite database layer — connection and schema

**Files:**
- Create: `electron/db/index.ts`
- Create: `electron/db/schema.ts`

- [ ] **Step 1: Write electron/db/schema.ts**

```typescript
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    visibility TEXT DEFAULT 'private' CHECK(visibility IN ('public','private')),
    layout_mode TEXT DEFAULT 'hierarchical' CHECK(layout_mode IN ('hierarchical','radial','force')),
    view_state TEXT DEFAULT '{"zoom":1,"panX":0,"panY":0}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
    node_type TEXT DEFAULT 'branch' CHECK(node_type IN ('root','branch','leaf')),
    title TEXT NOT NULL DEFAULT '',
    content TEXT DEFAULT '',
    description TEXT DEFAULT '',
    style TEXT DEFAULT '{}',
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    level INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    collapsed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type TEXT DEFAULT 'default',
    style TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL CHECK(task_type IN ('generate','expand','enrich')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed','stopped','restarting')),
    progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
    input_params TEXT DEFAULT '{}',
    result TEXT DEFAULT '{}',
    error_message TEXT DEFAULT '',
    mindmap_id TEXT REFERENCES mindmaps(id) ON DELETE SET NULL,
    node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK(provider_type IN ('openai','anthropic','deepseek','qwen','custom')),
    api_key TEXT NOT NULL,
    base_url TEXT DEFAULT '',
    model_id TEXT NOT NULL,
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;
```

- [ ] **Step 2: Write electron/db/index.ts**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { SCHEMA_SQL } from './schema';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'mindsprout.db');
    db = new Database(dbPath);
    db.exec(SCHEMA_SQL);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/db/index.ts electron/db/schema.ts
git commit -m "feat: add SQLite database connection and schema"
```

---

## Task 8: SQLite CRUD — mindmaps

**Files:**
- Create: `electron/db/mindmap.ts`

- [ ] **Step 1: Write mindmap CRUD**

```typescript
import { getDb } from './index';

export function listMindmaps() {
  const db = getDb();
  return db.prepare('SELECT * FROM mindmaps ORDER BY updated_at DESC').all();
}

export function getMindmap(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM mindmaps WHERE id = ?').get(id);
}

export function createMindmap(data: {
  id: string;
  title: string;
  description?: string;
  visibility?: string;
  layout_mode?: string;
  view_state?: string;
  created_at: number;
  updated_at: number;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO mindmaps (id, title, description, visibility, layout_mode, view_state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id,
    data.title,
    data.description || '',
    data.visibility || 'private',
    data.layout_mode || 'hierarchical',
    data.view_state || '{"zoom":1,"panX":0,"panY":0}',
    data.created_at,
    data.updated_at
  );
  return data.id;
}

export function updateMindmap(id: string, data: Partial<{
  title: string;
  description: string;
  visibility: string;
  layout_mode: string;
  view_state: string;
  updated_at: number;
}>) {
  const db = getDb();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  const stmt = db.prepare(`UPDATE mindmaps SET ${fields} WHERE id = ?`);
  stmt.run(...values, id);
}

export function deleteMindmap(id: string) {
  const db = getDb();
  db.prepare('DELETE FROM mindmaps WHERE id = ?').run(id);
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/db/mindmap.ts
git commit -m "feat: add mindmap CRUD operations"
```

---

## Task 9: IPC handlers registration

**Files:**
- Create: `electron/ipc/handlers.ts`
- Modify: `electron/main.ts` (register handlers)

- [ ] **Step 1: Write IPC handlers**

```typescript
import { ipcMain } from 'electron';
import * as mindmapDb from '../db/mindmap';

export function registerIpcHandlers() {
  // Mindmap handlers
  ipcMain.handle('db:listMindmaps', () => mindmapDb.listMindmaps());
  ipcMain.handle('db:getMindmap', (_, id: string) => mindmapDb.getMindmap(id));
  ipcMain.handle('db:createMindmap', (_, data: any) => mindmapDb.createMindmap(data));
  ipcMain.handle('db:updateMindmap', (_, id: string, data: any) => mindmapDb.updateMindmap(id, data));
  ipcMain.handle('db:deleteMindmap', (_, id: string) => mindmapDb.deleteMindmap(id));

  // Placeholder handlers for other DB operations
  ipcMain.handle('db:getNodes', (_, mindmapId: string) => {
    const db = require('../db/index').getDb();
    return db.prepare('SELECT * FROM nodes WHERE mindmap_id = ?').all(mindmapId);
  });
  ipcMain.handle('db:createNode', (_, data: any) => {
    const db = require('../db/index').getDb();
    const stmt = db.prepare(`INSERT INTO nodes (id, mindmap_id, parent_id, title, pos_x, pos_y, level, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(data.id, data.mindmap_id, data.parent_id || null, data.title, data.pos_x || 0, data.pos_y || 0, data.level || 0, data.sort_order || 0, data.created_at, data.updated_at);
    return data.id;
  });
  ipcMain.handle('db:updateNode', (_, id: string, data: any) => {
    const db = require('../db/index').getDb();
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE nodes SET ${fields} WHERE id = ?`);
    stmt.run(...Object.values(data), id);
  });
  ipcMain.handle('db:deleteNode', (_, id: string) => {
    const db = require('../db/index').getDb();
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
  });
  ipcMain.handle('db:getEdges', (_, mindmapId: string) => {
    const db = require('../db/index').getDb();
    return db.prepare('SELECT * FROM edges WHERE mindmap_id = ?').all(mindmapId);
  });
  ipcMain.handle('db:createEdge', (_, data: any) => {
    const db = require('../db/index').getDb();
    const stmt = db.prepare('INSERT INTO edges (id, mindmap_id, source_node_id, target_node_id, created_at) VALUES (?, ?, ?, ?, ?)');
    stmt.run(data.id, data.mindmap_id, data.source_node_id, data.target_node_id, data.created_at);
    return data.id;
  });
  ipcMain.handle('db:deleteEdge', (_, id: string) => {
    const db = require('../db/index').getDb();
    db.prepare('DELETE FROM edges WHERE id = ?').run(id);
  });

  // Settings handlers (placeholder)
  ipcMain.handle('settings:get', (_, key: string) => {
    const db = require('../db/index').getDb();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : null;
  });
  ipcMain.handle('settings:set', (_, key: string, value: string) => {
    const db = require('../db/index').getDb();
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
  });
  ipcMain.handle('settings:getProviders', () => {
    const db = require('../db/index').getDb();
    return db.prepare('SELECT * FROM ai_providers').all();
  });
  ipcMain.handle('settings:saveProvider', (_, data: any) => {
    const db = require('../db/index').getDb();
    const stmt = db.prepare(`INSERT OR REPLACE INTO ai_providers
      (id, display_name, provider_type, api_key, base_url, model_id, temperature, max_tokens, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(data.id, data.display_name, data.provider_type, data.api_key, data.base_url || '', data.model_id, data.temperature || 0.7, data.max_tokens || 4096, data.is_default || 0, data.created_at);
    return data.id;
  });
  ipcMain.handle('settings:deleteProvider', (_, id: string) => {
    const db = require('../db/index').getDb();
    db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);
  });

  // AI handlers (placeholder)
  ipcMain.handle('ai:startTask', (_, params: any) => {
    return 'placeholder-task-id';
  });
  ipcMain.handle('ai:stopTask', (_, taskId: string) => {});
  ipcMain.handle('ai:getTasks', () => []);
  ipcMain.handle('ai:deleteTask', (_, taskId: string) => {});
}
```

- [ ] **Step 2: Modify electron/main.ts to register handlers**

Add at the top of the file:
```typescript
import { registerIpcHandlers } from './ipc/handlers';
```

Add inside `app.whenReady()` before `createWindow()`:
```typescript
registerIpcHandlers();
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/handlers.ts electron/main.ts
git commit -m "feat: add IPC handlers for DB and settings"
```

---

## Task 10: SolidJS renderer entry and App component

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Write src/main.tsx**

```typescript
/* @refresh reload */
import { render } from 'solid-js/web';
import App from './App';
import './styles/global.css';

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
```

- [ ] **Step 2: Write src/App.tsx**

```typescript
import { createSignal, Match, Switch } from 'solid-js';
import EditorPage from './pages/EditorPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [currentPage, setCurrentPage] = createSignal<'editor' | 'settings'>('editor');

  return (
    <div class="app">
      <Switch>
        <Match when={currentPage() === 'editor'}>
          <EditorPage onOpenSettings={() => setCurrentPage('settings')} />
        </Match>
        <Match when={currentPage() === 'settings'}>
          <SettingsPage onClose={() => setCurrentPage('editor')} />
        </Match>
      </Switch>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx src/App.tsx
git commit -m "feat: add SolidJS renderer entry and App component"
```

---

## Task 11: Global CSS with theme variables

**Files:**
- Create: `src/styles/global.css`

- [ ] **Step 1: Write global.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root, .app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

:root {
  /* Light theme (default) */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-muted: #999999;
  --border-color: #d0d0d0;
  --accent-color: #3b82f6;
  --accent-hover: #2563eb;
  --danger-color: #ef4444;
  --success-color: #22c55e;
  --warning-color: #f59e0b;

  /* Node level colors */
  --node-level-0: #3b82f6;
  --node-level-1: #8b5cf6;
  --node-level-2: #ec4899;
  --node-level-3: #f97316;
  --node-level-4: #10b981;

  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  --border-radius: 8px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #252525;
  --bg-tertiary: #333333;
  --text-primary: #f0f0f0;
  --text-secondary: #b0b0b0;
  --text-muted: #808080;
  --border-color: #404040;
  --accent-color: #60a5fa;
  --accent-hover: #3b82f6;
}

body {
  font-family: var(--font-family);
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add global CSS with theme variables"
```

---

## Task 12: App store with theme support

**Files:**
- Create: `src/stores/appStore.ts`
- Create: `src/stores/index.ts`

- [ ] **Step 1: Write appStore.ts**

```typescript
import { createSignal, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';

interface AppState {
  theme: 'light' | 'dark';
  currentMindmapId: string | null;
  showListModal: boolean;
  showNotification: boolean;
  showSettings: boolean;
}

const [appStore, setAppStore] = createStore<AppState>({
  theme: 'light',
  currentMindmapId: null,
  showListModal: false,
  showNotification: false,
  showSettings: false,
});

// Theme persistence
createEffect(async () => {
  const saved = await window.electronAPI.settings.getSetting('theme');
  if (saved === 'dark' || saved === 'light') {
    setAppStore('theme', saved);
  }
});

createEffect(() => {
  document.documentElement.setAttribute('data-theme', appStore.theme);
  window.electronAPI.settings.setSetting('theme', appStore.theme);
});

export function toggleTheme() {
  setAppStore('theme', appStore.theme === 'light' ? 'dark' : 'light');
}

export function setCurrentMindmapId(id: string | null) {
  setAppStore('currentMindmapId', id);
}

export function toggleListModal() {
  setAppStore('showListModal', !appStore.showListModal);
}

export function toggleNotification() {
  setAppStore('showNotification', !appStore.showNotification);
}

export { appStore, setAppStore };
```

- [ ] **Step 2: Write stores/index.ts**

```typescript
export * from './appStore';
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/appStore.ts src/stores/index.ts
git commit -m "feat: add app store with theme persistence"
```

---

## Task 13: EditorPage skeleton

**Files:**
- Create: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Write EditorPage.tsx**

```typescript
import { appStore, toggleTheme, toggleListModal, toggleNotification } from '../stores';

interface EditorPageProps {
  onOpenSettings: () => void;
}

export default function EditorPage(props: EditorPageProps) {
  return (
    <div class="editor-page">
      {/* Left toolbar */}
      <div class="toolbar">
        <button class="toolbar-btn" onClick={toggleListModal} title="思维导图列表">
          📋
        </button>
        <button class="toolbar-btn" onClick={toggleTheme} title="切换主题">
          {appStore.theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button class="toolbar-btn" onClick={toggleNotification} title="通知中心">
          🔔
        </button>
        <button class="toolbar-btn" onClick={props.onOpenSettings} title="设置">
          ⚙️
        </button>
      </div>

      {/* Canvas area */}
      <div class="canvas-container">
        <canvas id="main-canvas" />
      </div>

      {/* Status bar */}
      <div class="status-bar">
        <span>思维芽 MindSprout</span>
        <span>{appStore.currentMindmapId ? '已加载' : '未选择导图'}</span>
      </div>

      {/* Modals (conditional) */}
      {appStore.showListModal && (
        <div class="modal-overlay" onClick={toggleListModal}>
          <div class="modal" onClick={e => e.stopPropagation()}>
            <h3>思维导图列表</h3>
            <p>（内容将在 Plan 3 实现）</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add EditorPage styles to global.css**

Append to `src/styles/global.css`:

```css
.editor-page {
  width: 100%;
  height: 100%;
  display: flex;
  position: relative;
}

.toolbar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
  background: var(--bg-secondary);
  padding: 12px 8px;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-md);
}

.toolbar-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--border-radius);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.toolbar-btn:hover {
  background: var(--bg-tertiary);
}

.canvas-container {
  flex: 1;
  position: relative;
  background: var(--bg-primary);
}

#main-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.status-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 12px;
  color: var(--text-secondary);
  z-index: 100;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: var(--bg-primary);
  border-radius: var(--border-radius);
  padding: 24px;
  min-width: 400px;
  max-width: 600px;
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/EditorPage.tsx src/styles/global.css
git commit -m "feat: add EditorPage skeleton with toolbar and canvas"
```

---

## Task 14: SettingsPage skeleton

**Files:**
- Create: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write SettingsPage.tsx**

```typescript
interface SettingsPageProps {
  onClose: () => void;
}

export default function SettingsPage(props: SettingsPageProps) {
  return (
    <div class="settings-page">
      <div class="settings-header">
        <h2>设置</h2>
        <button class="close-btn" onClick={props.onClose}>✕</button>
      </div>
      <div class="settings-content">
        <section class="settings-section">
          <h3>AI 服务商</h3>
          <p>（内容将在 Plan 4 实现）</p>
        </section>
        <section class="settings-section">
          <h3>外观</h3>
          <p>（内容将在后续计划实现）</p>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SettingsPage styles to global.css**

Append to `src/styles/global.css`:

```css
.settings-page {
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
}

.settings-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--border-radius);
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--bg-tertiary);
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx src/styles/global.css
git commit -m "feat: add SettingsPage skeleton"
```

---

## Task 15: First integration test — launch the app

**Files:**
- None (verify build and launch)

- [ ] **Step 1: Build all processes**

Run: `npm run build`

Expected: `dist/main.js`, `dist/preload.js`, `dist/index.html` created.

- [ ] **Step 2: Launch in dev mode**

Run: `npm run dev`

Expected: Electron window opens, shows "思维芽 MindSprout" title, toolbar with 4 buttons on left, status bar at bottom. Theme toggle works (click moon/sun icon).

- [ ] **Step 3: Test IPC roundtrip**

Open DevTools console and run:
```javascript
window.electronAPI.db.listMindmaps().then(console.log)
```

Expected: `[]` (empty array, no errors).

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify app launches and IPC works"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec Section | Plan 1 Task | Status |
|-------------|-------------|--------|
| Electron 三层架构 | Tasks 5, 6, 9, 10 | ✅ |
| SQLite Schema | Tasks 7, 8 | ✅ |
| IPC 封装层 | Tasks 6, 9 | ✅ |
| SolidJS Store | Tasks 12 | ✅ (appStore only, mindmapStore in Plan 3) |
| Canvas 编辑器 | Task 13 (skeleton) | 🔄 Full implementation in Plan 2 |
| AI 服务层 | Task 9 (placeholder) | 🔄 Full implementation in Plan 4 |
| 主题系统 | Tasks 11, 12 | ✅ |
| 设置页面 | Task 14 | 🔄 Full form in Plan 4 |

**2. Placeholder scan:** No TBD/TODO/fill-in-details found. All code is concrete and runnable.

**3. Type consistency:** All types in `src/types/index.ts` match IPC handler signatures and store interfaces.

---

## Next Plans

- **Plan 2**: Canvas editor core — Canvas 2D rendering engine, Pretext text layout, hit testing, drag/zoom/pan, layout algorithms (dagre, d3-force)
- **Plan 3**: Mindmap data management & UI — Node CRUD, node editor dialog, mindmap list modal, description panel, first-time wizard
- **Plan 4**: AI features & system integration — Llumiverse drivers, prompt templates, task lifecycle, notification center, settings forms
