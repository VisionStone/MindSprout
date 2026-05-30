import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { safeStorage } from 'electron';
import {
  OpenAIDriver,
  AnthropicDriver,
  OpenAICompatibleDriver,
} from '@llumiverse/drivers';
import { PromptRole } from '@llumiverse/core';
import { getDb } from '../db';
import {
  listMindmaps,
  getMindmap,
  createMindmap,
  updateMindmap,
  deleteMindmap,
} from '../db/mindmap';
import {
  getNodes,
  createNode,
  updateNode,
  deleteNode,
} from '../db/node';
import {
  getEdges,
  createEdge,
  deleteEdge,
} from '../db/edge';
import { TaskManager } from '../ai/TaskManager';
import { KnowledgeBaseService } from '../kb';
import type { AIProviderConfig, StartTaskInput } from '../../src/types';

const taskManager = new TaskManager();
const kbService = new KnowledgeBaseService();
let currentMainWindow: BrowserWindow | null = null;

function getTargetWindow(): BrowserWindow | null {
  if (currentMainWindow && !currentMainWindow.isDestroyed()) {
    return currentMainWindow;
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) return focused;
  const all = BrowserWindow.getAllWindows();
  return all[0] ?? null;
}

export function setMainWindow(window: BrowserWindow): void {
  currentMainWindow = window;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  currentMainWindow = mainWindow;
  log.info('[IPC] Registering IPC handlers');

  // ─────────────────────────────────────────────────────────────
  //  Mindmaps
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:listMindmaps', () => {
    try {
      return listMindmaps();
    } catch (err) {
      log.error('[IPC] listMindmaps failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:getMindmap', (_event, id: number) => {
    try {
      return getMindmap(id);
    } catch (err) {
      log.error('[IPC] getMindmap failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:createMindmap', (_event, data: unknown) => {
    try {
      return createMindmap(data as Parameters<typeof createMindmap>[0]);
    } catch (err) {
      log.error('[IPC] createMindmap failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:updateMindmap', (_event, data: unknown) => {
    try {
      return updateMindmap(data as Parameters<typeof updateMindmap>[0]);
    } catch (err) {
      log.error('[IPC] updateMindmap failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:deleteMindmap', (_event, id: number) => {
    try {
      deleteMindmap(id);
    } catch (err) {
      log.error('[IPC] deleteMindmap failed:', err);
      throw err;
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  Nodes
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:getNodes', (_event, mindmapId: number) => {
    try {
      return getNodes(mindmapId);
    } catch (err) {
      log.error('[IPC] getNodes failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:createNode', (_event, data: unknown) => {
    try {
      return createNode(data as Parameters<typeof createNode>[0]);
    } catch (err) {
      log.error('[IPC] createNode failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:updateNode', (_event, data: unknown) => {
    try {
      return updateNode(data as Parameters<typeof updateNode>[0]);
    } catch (err) {
      log.error('[IPC] updateNode failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:deleteNode', (_event, id: number) => {
    try {
      deleteNode(id);
    } catch (err) {
      log.error('[IPC] deleteNode failed:', err);
      throw err;
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  Edges
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('db:getEdges', (_event, mindmapId: number) => {
    try {
      return getEdges(mindmapId);
    } catch (err) {
      log.error('[IPC] getEdges failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:createEdge', (_event, data: unknown) => {
    try {
      return createEdge(data as Parameters<typeof createEdge>[0]);
    } catch (err) {
      log.error('[IPC] createEdge failed:', err);
      throw err;
    }
  });

  ipcMain.handle('db:deleteEdge', (_event, id: number) => {
    try {
      deleteEdge(id);
    } catch (err) {
      log.error('[IPC] deleteEdge failed:', err);
      throw err;
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  Settings
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('settings:getSetting', (_event, key: string) => {
    try {
      const db = getDb();
      const row = db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get(key) as { value: string } | undefined;
      if (!row) return null;
      return JSON.parse(row.value);
    } catch (err) {
      log.error('[IPC] getSetting failed:', err);
      throw err;
    }
  });

  ipcMain.handle(
    'settings:setSetting',
    (_event, key: string, value: unknown) => {
      try {
        const db = getDb();
        db
          .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
          .run(key, JSON.stringify(value));
      } catch (err) {
        log.error('[IPC] setSetting failed:', err);
        throw err;
      }
    }
  );

  ipcMain.handle('settings:getProviders', () => {
    try {
      const db = getDb();
      const rows = db
        .prepare('SELECT * FROM ai_providers ORDER BY created_at DESC')
        .all() as Record<string, unknown>[];
      return rows.map((row) => ({
        id: row.id as number,
        display_name: row.display_name as string,
        provider_type: row.provider_type as string,
        api_key: row.api_key as string,
        base_url: row.base_url as string,
        model_id: row.model_id as string,
        temperature: row.temperature as number,
        max_tokens: row.max_tokens as number,
        is_default: row.is_default as number,
        created_at: new Date((row.created_at as number) * 1000).toISOString(),
      }));
    } catch (err) {
      log.error('[IPC] getProviders failed:', err);
      throw err;
    }
  });

  ipcMain.handle('settings:saveProvider', (_event, data: unknown) => {
    try {
      const db = getDb();
      const d = data as Record<string, unknown>;
      const now = Math.floor(Date.now() / 1000);

      const baseUrl = (d.base_url as string) ?? '';
      const temperature = (d.temperature as number) ?? 0.7;
      const maxTokens = (d.max_tokens as number) ?? 4096;
      const isDefault = (d.is_default as boolean) ? 1 : 0;

      if (d.id) {
        db
          .prepare(
            `UPDATE ai_providers SET
              display_name = ?,
              provider_type = ?,
              api_key = ?,
              base_url = ?,
              model_id = ?,
              temperature = ?,
              max_tokens = ?,
              is_default = ?
            WHERE id = ?`
          )
          .run(
            d.display_name,
            d.provider_type,
            d.api_key,
            baseUrl,
            d.model_id,
            temperature,
            maxTokens,
            isDefault,
            d.id
          );

        const row = db
          .prepare('SELECT * FROM ai_providers WHERE id = ?')
          .get(d.id) as Record<string, unknown>;
        return {
          id: row.id as number,
          display_name: row.display_name as string,
          provider_type: row.provider_type as string,
          api_key: row.api_key as string,
          base_url: row.base_url as string,
          model_id: row.model_id as string,
          temperature: row.temperature as number,
          max_tokens: row.max_tokens as number,
          is_default: row.is_default as number,
          created_at: new Date(
            (row.created_at as number) * 1000
          ).toISOString(),
        };
      } else {
        const result = db
          .prepare(
            `INSERT INTO ai_providers (
              display_name, provider_type, api_key, base_url, model_id,
              temperature, max_tokens, is_default, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            d.display_name,
            d.provider_type,
            d.api_key,
            baseUrl,
            d.model_id,
            temperature,
            maxTokens,
            isDefault,
            now
          );

        const row = db
          .prepare('SELECT * FROM ai_providers WHERE id = ?')
          .get(result.lastInsertRowid) as Record<string, unknown>;
        return {
          id: row.id as number,
          display_name: row.display_name as string,
          provider_type: row.provider_type as string,
          api_key: row.api_key as string,
          base_url: row.base_url as string,
          model_id: row.model_id as string,
          temperature: row.temperature as number,
          max_tokens: row.max_tokens as number,
          is_default: row.is_default as number,
          created_at: new Date(
            (row.created_at as number) * 1000
          ).toISOString(),
        };
      }
    } catch (err) {
      log.error('[IPC] saveProvider failed:', err);
      throw err;
    }
  });

  ipcMain.handle('settings:deleteProvider', (_event, id: number) => {
    try {
      const db = getDb();
      db.prepare('DELETE FROM ai_providers WHERE id = ?').run(id);
    } catch (err) {
      log.error('[IPC] deleteProvider failed:', err);
      throw err;
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  AI
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('ai:startTask', async (_event, data: unknown) => {
    try {
      const params = data as StartTaskInput;
      const db = getDb();

      // Fetch provider from DB
      let providerRow: Record<string, unknown> | undefined;
      if (params.provider_id) {
        providerRow = db
          .prepare('SELECT * FROM ai_providers WHERE id = ?')
          .get(params.provider_id) as Record<string, unknown> | undefined;
      } else {
        providerRow = db
          .prepare('SELECT * FROM ai_providers WHERE is_default = 1 LIMIT 1')
          .get() as Record<string, unknown> | undefined;
      }

      if (!providerRow) {
        throw new Error('No AI provider configured');
      }

      const provider: AIProviderConfig = {
        id: providerRow.id as number,
        display_name: providerRow.display_name as string,
        provider_type: providerRow.provider_type as AIProviderConfig['provider_type'],
        api_key: providerRow.api_key as string,
        base_url: providerRow.base_url as string,
        model_id: providerRow.model_id as string,
        temperature: (providerRow.temperature as number) ?? 0.7,
        max_tokens: (providerRow.max_tokens as number) ?? 4096,
        is_default: (providerRow.is_default as number) ?? 0,
        created_at: new Date(
          (providerRow.created_at as number) * 1000
        ).toISOString(),
      };

      const task = taskManager.createTask(params);

      // Start in background — do not await
      const win = getTargetWindow();
      if (win) {
        taskManager.startTask(task.id, provider, win).catch((err) => {
          log.error('[IPC] startTask background execution failed:', err);
        });
      } else {
        log.warn('[IPC] No main window available to start task');
      }

      return task;
    } catch (err) {
      log.error('[IPC] startTask failed:', err);
      throw err;
    }
  });

  ipcMain.handle('ai:stopTask', (_event, id: number) => {
    try {
      taskManager.stopTask(id);
    } catch (err) {
      log.error('[IPC] stopTask failed:', err);
      throw err;
    }
  });

  ipcMain.handle('ai:getTasks', () => {
    try {
      return taskManager.getTasks();
    } catch (err) {
      log.error('[IPC] getTasks failed:', err);
      throw err;
    }
  });

  ipcMain.handle('ai:deleteTask', (_event, id: number) => {
    try {
      taskManager.deleteTask(id);
    } catch (err) {
      log.error('[IPC] deleteTask failed:', err);
      throw err;
    }
  });

  ipcMain.handle('ai:testProvider', async (_event, data: unknown) => {
    try {
      const config = data as AIProviderConfig;
      let apiKey: string;
      try {
        const encrypted = Buffer.from(config.api_key, 'base64');
        apiKey = safeStorage.decryptString(encrypted);
      } catch {
        apiKey = config.api_key;
      }

      let driver: OpenAIDriver | AnthropicDriver | OpenAICompatibleDriver;
      switch (config.provider_type) {
        case 'openai':
          driver = new OpenAIDriver({ apiKey });
          break;
        case 'anthropic':
          driver = new AnthropicDriver({
            apiKey,
            baseURL: config.base_url || undefined,
          });
          break;
        default:
          driver = new OpenAICompatibleDriver({
            apiKey,
            endpoint: config.base_url,
          });
          break;
      }

      const response = await driver.execute(
        [
          {
            role: PromptRole.system,
            content: 'You are a helpful assistant.',
          },
          {
            role: PromptRole.user,
            content: 'Say "Hello from MindSprout!" and nothing else.',
          },
        ],
        { model: config.model_id }
      );

      if (response.error) {
        throw new Error(`Provider test failed: ${response.error.message}`);
      }

      const result = response.result?.[0]?.value;
      return { success: true, result };
    } catch (err) {
      log.error('[IPC] testProvider failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  Knowledge Base
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('kb:list', () => {
    try {
      return kbService.listKnowledgeBases();
    } catch (err) {
      log.error('[IPC] kb:list failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:create', (_event, name: string, description?: string) => {
    try {
      return kbService.createKnowledgeBase(name, description);
    } catch (err) {
      log.error('[IPC] kb:create failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:get', (_event, id: number) => {
    try {
      return kbService.getKnowledgeBase(id);
    } catch (err) {
      log.error('[IPC] kb:get failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:delete', (_event, id: number) => {
    try {
      kbService.deleteKnowledgeBase(id);
    } catch (err) {
      log.error('[IPC] kb:delete failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:listDocuments', (_event, kbId: number) => {
    try {
      return kbService.listDocuments(kbId);
    } catch (err) {
      log.error('[IPC] kb:listDocuments failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:uploadDocument', async (_event, data: unknown) => {
    try {
      const d = data as { kb_id: number; filepath: string; filename: string; file_type: string; file_size: number };
      const embeddingConfig = kbService.getEmbeddingConfig();
      if (!embeddingConfig) {
        throw new Error('请先配置 Embedding 服务（在知识库面板中设置 API 地址、密钥和模型）');
      }
      return await kbService.uploadDocument(d.kb_id, d.filepath, d.filename, d.file_type, d.file_size, embeddingConfig);
    } catch (err) {
      log.error('[IPC] kb:uploadDocument failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:deleteDocument', (_event, id: number) => {
    try {
      kbService.deleteDocument(id);
    } catch (err) {
      log.error('[IPC] kb:deleteDocument failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:query', async (_event, data: unknown) => {
    try {
      const d = data as { kb_id: number; query: string; top_k?: number };
      const embeddingConfig = kbService.getEmbeddingConfig();
      if (!embeddingConfig) {
        throw new Error('请先配置 Embedding 服务');
      }
      return await kbService.query(d.kb_id, d.query, embeddingConfig, d.top_k);
    } catch (err) {
      log.error('[IPC] kb:query failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:openFileDialog', async () => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const fs = require('fs');
      const path = require('path');
      return result.filePaths.map((fp: string) => {
        const stat = fs.statSync(fp);
        const ext = path.extname(fp).toLowerCase().replace('.', '');
        return {
          filepath: fp,
          filename: path.basename(fp),
          file_type: ext,
          file_size: stat.size,
        };
      });
    } catch (err) {
      log.error('[IPC] kb:openFileDialog failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:getEmbeddingConfig', () => {
    try {
      const config = kbService.getEmbeddingConfig();
      if (!config) return null;
      return { baseUrl: config.baseUrl, model: config.model, hasApiKey: !!config.apiKey };
    } catch (err) {
      log.error('[IPC] kb:getEmbeddingConfig failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:saveEmbeddingConfig', (_event, data: unknown) => {
    try {
      const d = data as { baseUrl: string; apiKey: string; model: string };
      kbService.saveEmbeddingConfig(d);
    } catch (err) {
      log.error('[IPC] kb:saveEmbeddingConfig failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:retryDocument', async (_event, docId: number) => {
    try {
      const embeddingConfig = kbService.getEmbeddingConfig();
      if (!embeddingConfig) {
        throw new Error('请先配置 Embedding 服务');
      }
      return await kbService.retryDocument(docId, embeddingConfig);
    } catch (err) {
      log.error('[IPC] kb:retryDocument failed:', err);
      throw err;
    }
  });

  ipcMain.handle('kb:openFile', async (_event, filepath: string) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filepath);
    } catch (err) {
      log.error('[IPC] kb:openFile failed:', err);
      throw err;
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  Window Controls
  // ─────────────────────────────────────────────────────────────
  ipcMain.handle('window:minimize', () => {
    const win = getTargetWindow();
    win?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = getTargetWindow();
    win?.maximize();
  });

  ipcMain.handle('window:unmaximize', () => {
    const win = getTargetWindow();
    win?.unmaximize();
  });

  ipcMain.handle('window:close', () => {
    const win = getTargetWindow();
    win?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    const win = getTargetWindow();
    return win?.isMaximized() ?? false;
  });

  log.info('[IPC] All handlers registered');
}
