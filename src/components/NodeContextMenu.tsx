import { onCleanup, onMount } from 'solid-js';

/* -------------------------------------------------------------------------- */
//  NodeContextMenu
/* -------------------------------------------------------------------------- */

interface NodeContextMenuProps {
  x: number;
  y: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  onEdit: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onAIExpand: () => void;
  onAIEnrich: () => void;
  onClose: () => void;
}

export default function NodeContextMenu(props: NodeContextMenuProps) {
  const handleBackdropClick = (): void => {
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      props.onClose();
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  const menuStyle = (): string => {
    return `position:fixed;left:${props.x}px;top:${props.y}px;`;
  };

  return (
    <div class="modal-overlay" style="background:transparent;z-index:200;" onClick={handleBackdropClick}>
      <div class="context-menu" style={menuStyle()} onClick={(e) => e.stopPropagation()}>
        <button class="context-menu-item" onClick={() => { props.onEdit(); props.onClose(); }}>
          编辑节点
        </button>
        <button class="context-menu-item" onClick={() => { props.onAddChild(); props.onClose(); }}>
          添加子节点
        </button>
        <div class="context-menu-divider" />
        <button class="context-menu-item" style="color:var(--clr-danger);" onClick={() => { props.onDelete(); props.onClose(); }}>
          删除节点
        </button>
        <div class="context-menu-divider" />
        {props.hasChildren && (
          <button class="context-menu-item" onClick={() => { props.onToggleCollapse(); props.onClose(); }}>
            {props.isCollapsed ? '展开节点' : '折叠节点'}
          </button>
        )}
        <button class="context-menu-item" onClick={() => { props.onAIExpand(); props.onClose(); }}>
          AI 扩展节点
        </button>
        <button class="context-menu-item" onClick={() => { props.onAIEnrich(); props.onClose(); }}>
          AI 补充描述
        </button>
      </div>
    </div>
  );
}
