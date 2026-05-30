import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { getDb } from '../db';
import { AIService } from './AIService';
import type {
  Task,
  TaskType,
  TaskStatus,
  AIProviderConfig,
  StartTaskInput,
} from '../../src/types';

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function toISOString(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    task_type: row.task_type as TaskType,
    status: row.status as TaskStatus,
    progress: (row.progress as number) ?? 0,
    input_params: (row.input_params as string) ?? '{}',
    result: (row.result as string) ?? '{}',
    error_message: (row.error_message as string) ?? '',
    mindmap_id: (row.mindmap_id as number | null) ?? null,
    node_id: (row.node_id as number | null) ?? null,
    created_at: toISOString(row.created_at as number),
    updated_at: toISOString(row.updated_at as number),
    completed_at: row.completed_at
      ? toISOString(row.completed_at as number)
      : null,
  };
}

// ─────────────────────────────────────────────────────────────
//  TaskManager
// ─────────────────────────────────────────────────────────────

export class TaskManager {
  private aiService = new AIService();
  private abortControllers = new Map<number, AbortController>();

  /**
   * Insert a new task record into the database and return the Task object.
   */
  createTask(params: StartTaskInput): Task {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const inputParams = JSON.stringify({
      prompt: params.prompt,
      ragContext: params.ragContext,
      mindmap_id: params.mindmap_id,
    });

    const result = db
      .prepare(
        `INSERT INTO tasks (
          task_type, status, progress, input_params,
          mindmap_id, node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.task_type,
        'pending',
        0,
        inputParams,
        params.mindmap_id,
        params.node_id ?? null,
        now,
        now
      );

    return this.getTaskById(result.lastInsertRowid as number)!;
  }

  /**
   * Start a task in the background.
   * Updates status to 'running', calls the AI service, and sends IPC events.
   */
  async startTask(
    taskId: number,
    provider: AIProviderConfig,
    mainWindow: BrowserWindow
  ): Promise<void> {
    const db = getDb();
    const task = this.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Update status to running
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?'
    ).run('running', 0, now, taskId);

    // Create abort controller for this task
    const controller = new AbortController();
    this.abortControllers.set(taskId, controller);

    // Resolve node data if a node_id is attached
    let nodeTitle = '';
    let nodeContent = '';
    let ragContext: string | undefined;
    const inputParams = JSON.parse(task.input_params) as Record<string, unknown>;
    const prompt = (inputParams.prompt as string) || '';
    ragContext = inputParams.ragContext as string | undefined;

    if (task.node_id) {
      const nodeRow = db
        .prepare('SELECT title, content FROM nodes WHERE id = ?')
        .get(task.node_id) as
        | { title: string; content: string }
        | undefined;
      if (nodeRow) {
        nodeTitle = nodeRow.title;
        nodeContent = nodeRow.content;
      }
    }

    if (!nodeTitle) {
      nodeTitle = prompt;
    }

    try {
      if (task.task_type === 'enrich') {
        // Enrich uses streaming for progress feedback
        await this.runStreamTask(
          taskId,
          task.task_type,
          provider,
          nodeTitle,
          nodeContent,
          mainWindow,
          controller.signal,
          ragContext
        );
      } else {
        await this.runExecuteTask(
          taskId,
          task.task_type,
          provider,
          nodeTitle,
          nodeContent,
          mainWindow,
          controller.signal,
          ragContext
        );
      }
    } catch (err) {
      const isAborted = controller.signal.aborted;
      const finalStatus: TaskStatus = isAborted ? 'stopped' : 'failed';
      const errorMessage = err instanceof Error ? err.message : String(err);

      log.error(`[TaskManager] Task ${taskId} ${finalStatus}:`, errorMessage);

      const failNow = Math.floor(Date.now() / 1000);
      db.prepare(
        'UPDATE tasks SET status = ?, error_message = ?, updated_at = ? WHERE id = ?'
      ).run(finalStatus, errorMessage, failNow, taskId);

      this.sendIPC(mainWindow, 'task:error', {
        id: taskId,
        error: errorMessage,
      });
    } finally {
      this.abortControllers.delete(taskId);
    }
  }

  /**
   * Abort a running task.
   */
  stopTask(taskId: number): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      log.info(`[TaskManager] Task ${taskId} abort requested`);
    } else {
      log.warn(`[TaskManager] No running task ${taskId} to stop`);
    }
  }

  /**
   * Return all tasks from the database.
   */
  getTasks(): Task[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM tasks ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    return rows.map(rowToTask);
  }

  /**
   * Delete a task from the database.
   * Aborts the task first if it is running.
   */
  deleteTask(taskId: number): void {
    this.stopTask(taskId);
    const db = getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  // ─────────────────────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────────────────────

  private async runExecuteTask(
    taskId: number,
    taskType: TaskType,
    provider: AIProviderConfig,
    nodeTitle: string,
    nodeContent: string,
    mainWindow: BrowserWindow,
    signal: AbortSignal,
    ragContext?: string
  ): Promise<void> {
    const db = getDb();
    const params = this.buildAIParams(taskType, provider, nodeTitle, nodeContent, ragContext);

    this.sendIPC(mainWindow, 'task:progress', { id: taskId, progress: 10 });

    const result = await this.aiService.execute(taskType, params, signal);

    if (signal.aborted) {
      throw new Error('Task aborted');
    }

    const completeNow = Math.floor(Date.now() / 1000);
    db.prepare(
      'UPDATE tasks SET status = ?, progress = ?, result = ?, completed_at = ?, updated_at = ? WHERE id = ?'
    ).run('completed', 100, JSON.stringify(result), completeNow, completeNow, taskId);

    this.sendIPC(mainWindow, 'task:progress', { id: taskId, progress: 100 });
    this.sendIPC(mainWindow, 'task:complete', { id: taskId, result });
  }

  private async runStreamTask(
    taskId: number,
    taskType: TaskType,
    provider: AIProviderConfig,
    nodeTitle: string,
    nodeContent: string,
    mainWindow: BrowserWindow,
    signal: AbortSignal,
    ragContext?: string
  ): Promise<void> {
    const db = getDb();
    const params = this.buildAIParams(taskType, provider, nodeTitle, nodeContent, ragContext);

    let accumulated = '';
    let chunkCount = 0;

    this.sendIPC(mainWindow, 'task:progress', { id: taskId, progress: 10 });

    for await (const chunk of this.aiService.stream(taskType, params, signal)) {
      accumulated += chunk;
      chunkCount++;

      const progress = Math.min(10 + chunkCount * 2, 90);
      this.sendIPC(mainWindow, 'task:progress', { id: taskId, progress });
    }

    if (signal.aborted) {
      throw new Error('Task aborted');
    }

    const completeNow = Math.floor(Date.now() / 1000);
    db.prepare(
      'UPDATE tasks SET status = ?, progress = ?, result = ?, completed_at = ?, updated_at = ? WHERE id = ?'
    ).run(
      'completed',
      100,
      JSON.stringify(accumulated),
      completeNow,
      completeNow,
      taskId
    );

    this.sendIPC(mainWindow, 'task:progress', { id: taskId, progress: 100 });
    this.sendIPC(mainWindow, 'task:complete', {
      id: taskId,
      result: accumulated,
    });
  }

  private buildAIParams(
    taskType: TaskType,
    provider: AIProviderConfig,
    nodeTitle: string,
    nodeContent: string,
    ragContext?: string
  ): Record<string, unknown> {
    switch (taskType) {
      case 'generate':
        return { provider, topic: nodeTitle, ragContext };
      case 'expand':
        return { provider, nodeTitle, nodeContent, ragContext };
      case 'enrich':
        return { provider, nodeTitle, nodeContent, ragContext };
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  private getTaskById(id: number): Task | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToTask(row);
  }

  private sendIPC(
    mainWindow: BrowserWindow,
    channel: string,
    payload: unknown
  ): void {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  }
}
