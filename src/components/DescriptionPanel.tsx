import { marked } from 'marked';
import { onMount, onCleanup } from 'solid-js';
import type { Node } from '@/types';

interface DescriptionPanelProps {
  node: Node;
  onClose: () => void;
}

export default function DescriptionPanel(props: DescriptionPanelProps) {
  const htmlContent = (): string => {
    const desc = props.node.description || '';
    return marked.parse(desc) as string;
  };

  const sourceFilename = (): string => {
    const doc = props.node.source_doc;
    if (!doc) return '';
    const parts = doc.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || doc;
  };

  const sourceHtml = (): string => {
    if (!props.node.source_chunk) return '';
    return marked.parse(props.node.source_chunk) as string;
  };

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });

  const handleOpenFile = (): void => {
    if (props.node.source_doc) {
      window.electronAPI.kb.openFile(props.node.source_doc);
    }
  };

  return (
    <div class="fullscreen-description-overlay" onClick={props.onClose}>
      <div class="fullscreen-description-modal" onClick={(e) => e.stopPropagation()}>
        <div class="fullscreen-description-header">
          <h4>{props.node.title}</h4>
          <button class="close-btn" onClick={props.onClose}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div
          class="fullscreen-description-content"
          innerHTML={htmlContent()}
        />
        {props.node.source_doc && (
          <div class="source-section">
            <div class="source-section-header">
              <svg viewBox="0 0 24 24" class="source-link-icon">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>来源</span>
            </div>
            <div class="source-section-doc">
              <span class="source-doc-badge">{sourceFilename()}</span>
              <button class="btn btn-ghost source-open-btn" onClick={handleOpenFile}>
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                打开文档
              </button>
            </div>
            {props.node.source_chunk && (
              <div class="source-section-chunk" innerHTML={sourceHtml()} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
