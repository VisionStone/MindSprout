import { createStore } from 'solid-js/store';

/* -------------------------------------------------------------------------- */
//  Types
/* -------------------------------------------------------------------------- */

export type InteractionMode =
  | 'idle'
  | 'panning'
  | 'dragging-node';

export type DropAction = 'none' | 'reparent' | 'reorder';

export interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedNodeIds: Set<string>;
  draggingNodeId: string | null;
  hoverNodeId: string | null;
  interactionMode: InteractionMode;
  dragOriginalPosX: number;
  dragOriginalPosY: number;
  dragOriginalParentId: number | null;
  dragOriginalSortOrder: number;
  dropTargetId: string | null;
  dropAction: DropAction;
  reorderSiblingId: string | null;
  reorderPosition: 'before' | 'after' | null;
}

/* -------------------------------------------------------------------------- */
//  Initial state
/* -------------------------------------------------------------------------- */

const [canvasState, setState] = createStore<CanvasState>({
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedNodeIds: new Set(),
  draggingNodeId: null,
  hoverNodeId: null,
  interactionMode: 'idle',
  dragOriginalPosX: 0,
  dragOriginalPosY: 0,
  dragOriginalParentId: null,
  dragOriginalSortOrder: 0,
  dropTargetId: null,
  dropAction: 'none',
  reorderSiblingId: null,
  reorderPosition: null,
});

/* -------------------------------------------------------------------------- */
//  Actions
/* -------------------------------------------------------------------------- */

export function setZoom(zoom: number): void {
  setState('zoom', zoom);
}

export function setPan(panX: number, panY: number): void {
  setState('panX', panX);
  setState('panY', panY);
}

export function selectNode(nodeId: string): void {
  setState('selectedNodeIds', (prev) => {
    const next = new Set(prev);
    next.add(nodeId);
    return next;
  });
}

export function clearSelection(): void {
  setState('selectedNodeIds', new Set());
}

export function setDraggingNodeId(nodeId: string | null): void {
  setState('draggingNodeId', nodeId);
}

export function setHoverNodeId(nodeId: string | null): void {
  setState('hoverNodeId', nodeId);
}

export function setInteractionMode(mode: InteractionMode): void {
  setState('interactionMode', mode);
}

export function setDragOriginalPos(x: number, y: number): void {
  setState('dragOriginalPosX', x);
  setState('dragOriginalPosY', y);
}

export function setDragOriginalParentId(id: number | null): void {
  setState('dragOriginalParentId', id);
}

export function setDragOriginalSortOrder(order: number): void {
  setState('dragOriginalSortOrder', order);
}

export function setDropTargetId(id: string | null): void {
  setState('dropTargetId', id);
}

export function setDropAction(action: DropAction): void {
  setState('dropAction', action);
}

export function setReorderInfo(siblingId: string | null, position: 'before' | 'after' | null): void {
  setState('reorderSiblingId', siblingId);
  setState('reorderPosition', position);
}

export function clearDragState(): void {
  setState({
    draggingNodeId: null,
    dragOriginalPosX: 0,
    dragOriginalPosY: 0,
    dragOriginalParentId: null,
    dragOriginalSortOrder: 0,
    dropTargetId: null,
    dropAction: 'none',
    reorderSiblingId: null,
    reorderPosition: null,
    interactionMode: 'idle',
  });
}

/* -------------------------------------------------------------------------- */
//  Exports
/* -------------------------------------------------------------------------- */

export { canvasState };
