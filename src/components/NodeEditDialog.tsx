import { createSignal } from 'solid-js';
import type { Node } from '@/types';

/* -------------------------------------------------------------------------- */
//  NodeEditDialog
/* -------------------------------------------------------------------------- */

interface NodeEditDialogProps {
  node: Node;
  onSave: (updates: Partial<Node>) => void;
  onClose: () => void;
}

export default function NodeEditDialog(props: NodeEditDialogProps) {
  const [title, setTitle] = createSignal(props.node.title);
  const [content, setContent] = createSignal(props.node.content);
  const [description, setDescription] = createSignal(props.node.description);

  const handleSave = (): void => {
    props.onSave({
      title: title(),
      content: content(),
      description: description(),
      updated_at: new Date().toISOString(),
    });
    props.onClose();
  };

  return (
    <div class="modal-overlay" onClick={props.onClose}>
      <div class="modal edit-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="edit-dialog-header">
          <h3>编辑节点</h3>
          <button class="close-btn" onClick={props.onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="edit-dialog-body">
          <div class="form-group">
            <label for="node-title">标题</label>
            <input
              id="node-title"
              type="text"
              class="form-input"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </div>

          <div class="form-group">
            <label for="node-content">内容</label>
            <input
              id="node-content"
              type="text"
              class="form-input"
              value={content()}
              onInput={(e) => setContent(e.currentTarget.value)}
            />
          </div>

          <div class="form-group">
            <label for="node-description">描述 (Markdown)</label>
            <textarea
              id="node-description"
              class="form-textarea"
              rows={6}
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="edit-dialog-footer">
          <button class="btn btn-secondary" onClick={props.onClose}>
            取消
          </button>
          <button class="btn btn-primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
