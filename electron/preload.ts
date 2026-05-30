import { contextBridge, ipcRenderer } from 'electron';

// =============================================================================
// MindSprout — Electron Preload Script
// Exposes a typed, namespaced API to the renderer process.
// =============================================================================

/* -------------------------------------------------------------------------- */
//  Type declarations for the renderer side
/* -------------------------------------------------------------------------- */

export interface ElectronAPI {
  db: {
    listMindmaps: () => Promise<unknown[]>;
    getMindmap: (id: number) => Promise<unknown | null>;
    createMindmap: (data: unknown) => Promise<unknown>;
    updateMindmap: (data: unknown) => Promise<unknown>;
    deleteMindmap: (id: number) => Promise<void>;
    getNodes: (mindmapId: number) => Promise<unknown[]>;
    createNode: (data: unknown) => Promise<unknown>;
    updateNode: (data: unknown) => Promise<unknown>;
    deleteNode: (id: number) => Promise<void>;
    getEdges: (mindmapId: number) => Promise<unknown[]>;
    createEdge: (data: unknown) => Promise<unknown>;
    deleteEdge: (id: number) => Promise<void>;
  };
  settings: {
    getSetting: <T = unknown>(key: string) => Promise<T | null>;
    setSetting: <T = unknown>(key: string, value: T) => Promise<void>;
    getProviders: () => Promise<unknown[]>;
    saveProvider: (data: unknown) => Promise<unknown>;
    deleteProvider: (id: number) => Promise<void>;
  };
  ai: {
    startTask: (data: unknown) => Promise<unknown>;
    stopTask: (id: number) => Promise<void>;
    getTasks: (mindmapId?: number) => Promise<unknown[]>;
    deleteTask: (id: number) => Promise<void>;
    testProvider: (data: unknown) => Promise<unknown>;
  };
  kb: {
    list: () => Promise<unknown[]>;
    create: (name: string, description?: string) => Promise<unknown>;
    get: (id: number) => Promise<unknown | null>;
    delete: (id: number) => Promise<void>;
    listDocuments: (kbId: number) => Promise<unknown[]>;
    uploadDocument: (data: unknown) => Promise<unknown>;
    deleteDocument: (id: number) => Promise<void>;
    query: (data: unknown) => Promise<unknown>;
    openFileDialog: () => Promise<unknown>;
    getEmbeddingConfig: () => Promise<unknown>;
    saveEmbeddingConfig: (data: unknown) => Promise<void>;
    retryDocument: (docId: number) => Promise<unknown>;
    openFile: (filepath: string) => Promise<void>;
  };
  onTaskProgress: (
    callback: (payload: { id: number; progress: number }) => void
  ) => () => void;
  onTaskComplete: (
    callback: (payload: { id: number; result: unknown }) => void
  ) => () => void;
  onTaskError: (
    callback: (payload: { id: number; error: string }) => void
  ) => () => void;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    unmaximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

/* -------------------------------------------------------------------------- */
//  Helper to build safe IPC invoke wrappers
/* -------------------------------------------------------------------------- */

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args);
}

function onEvent<T = unknown>(
  channel: string,
  callback: (payload: T) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) =>
    callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/* -------------------------------------------------------------------------- */
//  Expose API under `window.electronAPI`
/* -------------------------------------------------------------------------- */

const api: ElectronAPI = {
  db: {
    listMindmaps: () => invoke('db:listMindmaps'),
    getMindmap: (id: number) => invoke('db:getMindmap', id),
    createMindmap: (data: unknown) => invoke('db:createMindmap', data),
    updateMindmap: (data: unknown) => invoke('db:updateMindmap', data),
    deleteMindmap: (id: number) => invoke('db:deleteMindmap', id),
    getNodes: (mindmapId: number) => invoke('db:getNodes', mindmapId),
    createNode: (data: unknown) => invoke('db:createNode', data),
    updateNode: (data: unknown) => invoke('db:updateNode', data),
    deleteNode: (id: number) => invoke('db:deleteNode', id),
    getEdges: (mindmapId: number) => invoke('db:getEdges', mindmapId),
    createEdge: (data: unknown) => invoke('db:createEdge', data),
    deleteEdge: (id: number) => invoke('db:deleteEdge', id),
  },
  settings: {
    getSetting: <T = unknown>(key: string) => invoke<T | null>('settings:getSetting', key),
    setSetting: <T = unknown>(key: string, value: T) => invoke<void>('settings:setSetting', key, value),
    getProviders: () => invoke('settings:getProviders'),
    saveProvider: (data: unknown) => invoke('settings:saveProvider', data),
    deleteProvider: (id: number) => invoke('settings:deleteProvider', id),
  },
  ai: {
    startTask: (data: unknown) => invoke('ai:startTask', data),
    stopTask: (id: number) => invoke<void>('ai:stopTask', id),
    getTasks: (mindmapId?: number) => invoke('ai:getTasks', mindmapId),
    deleteTask: (id: number) => invoke<void>('ai:deleteTask', id),
    testProvider: (data: unknown) => invoke('ai:testProvider', data),
  },
  kb: {
    list: () => invoke('kb:list'),
    create: (name: string, description?: string) => invoke('kb:create', name, description),
    get: (id: number) => invoke('kb:get', id),
    delete: (id: number) => invoke<void>('kb:delete', id),
    listDocuments: (kbId: number) => invoke('kb:listDocuments', kbId),
    uploadDocument: (data: unknown) => invoke('kb:uploadDocument', data),
    deleteDocument: (id: number) => invoke<void>('kb:deleteDocument', id),
    query: (data: unknown) => invoke('kb:query', data),
    openFileDialog: () => invoke('kb:openFileDialog'),
    getEmbeddingConfig: () => invoke('kb:getEmbeddingConfig'),
    saveEmbeddingConfig: (data: unknown) => invoke<void>('kb:saveEmbeddingConfig', data),
    retryDocument: (docId: number) => invoke('kb:retryDocument', docId),
    openFile: (filepath: string) => invoke<void>('kb:openFile', filepath),
  },
  onTaskProgress: (callback) => onEvent('task:progress', callback),
  onTaskComplete: (callback) => onEvent('task:complete', callback),
  onTaskError: (callback) => onEvent('task:error', callback),
  window: {
    minimize: () => invoke<void>('window:minimize'),
    maximize: () => invoke<void>('window:maximize'),
    unmaximize: () => invoke<void>('window:unmaximize'),
    close: () => invoke<void>('window:close'),
    isMaximized: () => invoke<boolean>('window:isMaximized'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
