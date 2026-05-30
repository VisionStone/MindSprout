import { createSignal, onMount, onCleanup, For } from 'solid-js';
import type { Task, TaskStatus } from '@/types';

/* -------------------------------------------------------------------------- */
//  NotificationCenter
/* -------------------------------------------------------------------------- */

interface NotificationCenterProps {
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  generate: '生成导图',
  expand: '扩展节点',
  enrich: '补充描述',
};

const statusLabels: Record<TaskStatus, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  stopped: '已停止',
  restarting: '重启中',
};

export default function NotificationCenter(props: NotificationCenterProps) {
  const [tasks, setTasks] = createSignal<Task[]>([]);

  onMount(async () => {
    try {
      const allTasks = (await window.electronAPI.ai.getTasks()) as Task[];
      setTasks(allTasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }

    const unsubProgress = window.electronAPI.onTaskProgress((payload) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === payload.id
            ? { ...t, progress: payload.progress, status: 'running' }
            : t
        )
      );
    });

    const unsubComplete = window.electronAPI.onTaskComplete((payload) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === payload.id
            ? { ...t, status: 'completed', result: JSON.stringify(payload.result) }
            : t
        )
      );
    });

    const unsubError = window.electronAPI.onTaskError((payload) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === payload.id
            ? { ...t, status: 'failed', error_message: payload.error }
            : t
        )
      );
    });

    onCleanup(() => {
      unsubProgress();
      unsubComplete();
      unsubError();
    });
  });

  const handleStop = async (id: number): Promise<void> => {
    try {
      await window.electronAPI.ai.stopTask(id);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'stopped' as TaskStatus } : t))
      );
    } catch (err) {
      console.error('Failed to stop task:', err);
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await window.electronAPI.ai.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const canStop = (status: TaskStatus): boolean =>
    status === 'pending' || status === 'running' || status === 'restarting';

  const canDelete = (status: TaskStatus): boolean =>
    status === 'completed' || status === 'failed' || status === 'stopped';

  return (
    <div class="notification-panel">
      <div class="notification-header">
        <h3>任务中心</h3>
        <button class="close-btn" onClick={props.onClose}>
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="notification-list">
        <For each={tasks()} fallback={<div class="empty-state">暂无任务</div>}>
          {(task) => (
            <div class="notification-item">
              <div class="notification-item-header">
                <span class="notification-icon">
                {task.status === 'pending' && <svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="12 6 12 12 16 14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>}
                {task.status === 'running' && <svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M10 8l6 4-6 4V8z" fill="currentColor"/></svg>}
                {task.status === 'completed' && <svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="9 12 11 14 15 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>}
                {task.status === 'failed' && <svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>}
                {task.status === 'stopped' && <svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><rect x="9" y="9" width="6" height="6" fill="currentColor" rx="1"/></svg>}
                {task.status === 'restarting' && <svg viewBox="0 0 24 24" style="width:18px;height:18px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="23 4 23 10 17 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>}
              </span>
                <span class="notification-type">{typeLabels[task.task_type] ?? task.task_type}</span>
                <span class="notification-status">{statusLabels[task.status]}</span>
              </div>

              {task.status === 'running' && (
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    style={`width:${task.progress}%`}
                  />
                </div>
              )}

              {task.status === 'failed' && task.error_message && (
                <div class="notification-error">{task.error_message}</div>
              )}

              <div class="notification-actions">
                {canStop(task.status) && (
                  <button
                    class="btn btn-secondary"
                    onClick={() => handleStop(task.id)}
                  >
                    停止
                  </button>
                )}
                {canDelete(task.status) && (
                  <button
                    class="btn btn-secondary"
                    onClick={() => handleDelete(task.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
