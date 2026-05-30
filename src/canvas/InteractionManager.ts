// ============================================================
// MindSprout — InteractionManager
// Mouse / wheel / keyboard input → store updates
// Supports three drag-drop behaviors:
//   1. Reparent  — drop onto another node's center → becomes child
//   2. Reorder   — drop near a sibling's top/bottom edge → reorder
//   3. Snap-back — no valid target → return to original position
// ============================================================

import type { Node, Edge } from '@/types';
import {
  canvasState,
  setPan,
  setZoom,
  selectNode,
  clearSelection,
  setDraggingNodeId,
  setHoverNodeId,
  setInteractionMode,
  setDragOriginalPos,
  setDragOriginalParentId,
  setDragOriginalSortOrder,
  setDropTargetId,
  setDropAction,
  setReorderInfo,
  clearDragState,
} from '@/stores/canvasStore';
import {
  mindmapState,
  updateNode,
  removeNode,
  removeEdge,
  addEdge,
  setNodes,
  hasChildren,
} from '@/stores/mindmapStore';
import {
  recordDeleteSubtree,
  recordReparent,
  recordReorder,
  recordToggleCollapse,
  undo,
  redo,
} from '@/stores/undoStore';
import { getPaginationControlBounds, getSourceIconBounds } from './NodeRenderer';
import type { Rect, NodeLayout } from './NodeRenderer';
import { screenToWorld, worldToScreen } from './HitTester';
import { applyHierarchicalLayout, applyLayoutWithAnchor } from './LayoutEngine';
import type { CanvasEngine } from './CanvasEngine';

/* -------------------------------------------------------------------------- */
//  Helpers
/* -------------------------------------------------------------------------- */

function hitTestNode(
  screenX: number,
  screenY: number,
  nodes: Map<string, Node>,
  layouts: Map<string, NodeLayout>
): string | null {
  const worldPos = screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);
  const entries = Array.from(nodes.entries());
  for (let i = entries.length - 1; i >= 0; i--) {
    const [nodeId, node] = entries[i];
    const layout = layouts.get(nodeId);
    if (!layout) continue;

    // Check node rectangle
    const inRect =
      worldPos.x >= node.pos_x &&
      worldPos.x <= node.pos_x + layout.width &&
      worldPos.y >= node.pos_y &&
      worldPos.y <= node.pos_y + layout.height;

    if (inRect) {
      if (!isNodeVisible(nodeId, nodes)) continue;
      return nodeId;
    }

    // Check collapse button (right edge, extends outside node rect)
    const hasChildren = (() => {
      for (const n of nodes.values()) {
        if (n.parent_id !== null && String(n.parent_id) === nodeId) {
          return true;
        }
      }
      return false;
    })();

    if (hasChildren) {
      const btnR = 7;
      const btnCX = node.pos_x + layout.width;
      const btnCY = node.pos_y + layout.height / 2;
      const dx = worldPos.x - btnCX;
      const dy = worldPos.y - btnCY;
      if (dx * dx + dy * dy <= btnR * btnR) {
        if (!isNodeVisible(nodeId, nodes)) continue;
        return nodeId;
      }
    }
  }
  return null;
}

function isNodeVisible(nodeId: string, nodes: Map<string, Node>): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;
  let current = node;
  while (current.parent_id !== null) {
    const parent = nodes.get(String(current.parent_id));
    if (!parent) break;
    if (parent.collapsed === 1) return false;
    current = parent;
  }
  return true;
}

function isDescendantOf(potentialDescendantId: string, ancestorId: string, nodes: Map<string, Node>): boolean {
  let current = nodes.get(potentialDescendantId);
  while (current && current.parent_id !== null) {
    if (String(current.parent_id) === ancestorId) return true;
    current = nodes.get(String(current.parent_id));
  }
  return false;
}

function collectDescendantIds(parentId: string, nodes: Map<string, Node>): string[] {
  const result: string[] = [];
  for (const [id, node] of nodes) {
    if (node.parent_id !== null && String(node.parent_id) === parentId) {
      result.push(id);
      result.push(...collectDescendantIds(id, nodes));
    }
  }
  return result;
}

function getNextSortOrder(parentId: string, nodes: Map<string, Node>): number {
  let maxOrder = -1;
  for (const node of nodes.values()) {
    if (node.parent_id !== null && String(node.parent_id) === parentId) {
      maxOrder = Math.max(maxOrder, node.sort_order);
    }
  }
  return maxOrder + 1;
}

function hitTestCollapseButton(
  screenX: number,
  screenY: number,
  nodeId: string,
  nodes: Map<string, Node>,
  layouts: Map<string, NodeLayout>
): boolean {
  const node = nodes.get(nodeId);
  const layout = layouts.get(nodeId);
  if (!node || !layout) return false;

  const hasChildren = (() => {
    for (const n of nodes.values()) {
      if (n.parent_id !== null && String(n.parent_id) === nodeId) {
        return true;
      }
    }
    return false;
  })();

  if (!hasChildren) return false;

  const btnScreenPos = worldToScreen(
    node.pos_x + layout.width,
    node.pos_y + layout.height / 2,
    canvasState.panX,
    canvasState.panY,
    canvasState.zoom
  );

  const hitR = 14;
  const dx = screenX - btnScreenPos.x;
  const dy = screenY - btnScreenPos.y;
  return dx * dx + dy * dy <= hitR * hitR;
}

function hitTestPaginationButton(
  screenX: number,
  screenY: number,
  nodeId: string,
  nodes: Map<string, Node>,
  layouts: Map<string, NodeLayout>,
  pageIndex: number = 0
): 'prev' | 'next' | null {
  const node = nodes.get(nodeId);
  const layout = layouts.get(nodeId);
  if (!node || !layout) return null;

  const bounds = getPaginationControlBounds(node, layout, pageIndex);
  if (!bounds) return null;

  const worldPos = screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);

  const inRect = (r: Rect): boolean =>
    worldPos.x >= r.x && worldPos.x <= r.x + r.width &&
    worldPos.y >= r.y && worldPos.y <= r.y + r.height;

  if (inRect(bounds.prevBtn)) return 'prev';
  if (inRect(bounds.nextBtn)) return 'next';
  return null;
}

function hitTestSourceIcon(
  screenX: number,
  screenY: number,
  nodes: Map<string, Node>,
  layouts: Map<string, NodeLayout>
): string | null {
  const worldPos = screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);
  const entries = Array.from(nodes.entries());
  for (let i = entries.length - 1; i >= 0; i--) {
    const [nodeId, node] = entries[i];
    if (!node.source_doc) continue;
    const layout = layouts.get(nodeId);
    if (!layout) continue;

    const bounds = getSourceIconBounds(node, layout);
    if (!bounds) continue;

    if (
      worldPos.x >= bounds.x &&
      worldPos.x <= bounds.x + bounds.width &&
      worldPos.y >= bounds.y &&
      worldPos.y <= bounds.y + bounds.height
    ) {
      if (!isNodeVisible(nodeId, nodes)) continue;
      return nodeId;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
//  Callbacks interface
/* -------------------------------------------------------------------------- */

export interface InteractionCallbacks {
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodeContextMenu?: (nodeId: string, screenX: number, screenY: number) => void;
}

/* -------------------------------------------------------------------------- */
//  InteractionManager
/* -------------------------------------------------------------------------- */

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private engine: CanvasEngine;
  private callbacks: InteractionCallbacks;

  private isDragging = false;
  private dragStartScreenX = 0;
  private dragStartScreenY = 0;
  private lastPanX = 0;
  private lastPanY = 0;
  private dragNodeId: string | null = null;
  private dragNodeOffsetX = 0;
  private dragNodeOffsetY = 0;

  // Click-vs-drag detection
  private hasDragged = false;
  private readonly dragThreshold = 3;

  // Original position of the node being dragged (for snap-back)
  private dragOriginalX = 0;
  private dragOriginalY = 0;

  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseUp: (e: MouseEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnDblClick: (e: MouseEvent) => void;
  private boundOnContextMenu: (e: MouseEvent) => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;

  constructor(canvas: HTMLCanvasElement, engine: CanvasEngine, callbacks?: InteractionCallbacks) {
    this.canvas = canvas;
    this.engine = engine;
    this.callbacks = callbacks ?? {};

    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnDblClick = this.onDblClick.bind(this);
    this.boundOnContextMenu = this.onContextMenu.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);

    canvas.addEventListener('mousedown', this.boundOnMouseDown);
    canvas.addEventListener('mousemove', this.boundOnMouseMove);
    canvas.addEventListener('mouseup', this.boundOnMouseUp);
    canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });
    canvas.addEventListener('dblclick', this.boundOnDblClick);
    canvas.addEventListener('contextmenu', this.boundOnContextMenu);
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  /* ---------------------------------------------------------------------- */
  //  Mouse down
  /* ---------------------------------------------------------------------- */

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const layouts = this.engine.getNodeLayouts();

    // Check source icon click first (highest priority)
    const sourceHitId = hitTestSourceIcon(screenX, screenY, mindmapState.nodes, layouts);
    if (sourceHitId) {
      const sourceNode = mindmapState.nodes.get(sourceHitId);
      if (sourceNode?.source_doc) {
        window.electronAPI.kb.openFile(sourceNode.source_doc).catch(err => console.error('Failed to open source file:', err));
      }
      return;
    }

    const hitNodeId = hitTestNode(screenX, screenY, mindmapState.nodes, layouts);

    if (hitNodeId) {
      // Check if clicking collapse button
      if (hitTestCollapseButton(screenX, screenY, hitNodeId, mindmapState.nodes, layouts)) {
        this.handleToggleCollapse(hitNodeId);
        return;
      }

      // Check if clicking pagination controls
      const pageIndex = this.engine.getExpandedNodePage(hitNodeId);
      const paginationHit = hitTestPaginationButton(screenX, screenY, hitNodeId, mindmapState.nodes, layouts, pageIndex);
      if (paginationHit) {
        if (!canvasState.selectedNodeIds.has(hitNodeId)) {
          clearSelection();
          selectNode(hitNodeId);
        }
        const currentPage = this.engine.getExpandedNodePage(hitNodeId);
        if (paginationHit === 'prev') {
          this.engine.setExpandedNodePage(hitNodeId, currentPage - 1);
        } else {
          this.engine.setExpandedNodePage(hitNodeId, currentPage + 1);
        }
        this.engine.markDirty();
        return;
      }

      if (e.shiftKey) {
        selectNode(hitNodeId);
      } else if (!canvasState.selectedNodeIds.has(hitNodeId)) {
        clearSelection();
        selectNode(hitNodeId);
      }

      const node = mindmapState.nodes.get(hitNodeId);
      if (node) {
        const worldPos = screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);
        this.dragNodeId = hitNodeId;
        this.dragNodeOffsetX = worldPos.x - node.pos_x;
        this.dragNodeOffsetY = worldPos.y - node.pos_y;

        this.dragOriginalX = node.pos_x;
        this.dragOriginalY = node.pos_y;
        setDragOriginalPos(node.pos_x, node.pos_y);
        setDragOriginalParentId(node.parent_id);
        setDragOriginalSortOrder(node.sort_order);
      }

      this.isDragging = true;
      this.hasDragged = false;
      this.dragStartScreenX = screenX;
      this.dragStartScreenY = screenY;
      setDraggingNodeId(hitNodeId);
      setInteractionMode('dragging-node');
    } else {
      this.isDragging = true;
      this.dragStartScreenX = screenX;
      this.dragStartScreenY = screenY;
      this.lastPanX = canvasState.panX;
      this.lastPanY = canvasState.panY;
      setInteractionMode('panning');

      if (!e.shiftKey) {
        clearSelection();
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Mouse move
  /* ---------------------------------------------------------------------- */

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (!this.isDragging) {
      const layouts = this.engine.getNodeLayouts();
      const hitNodeId = hitTestNode(screenX, screenY, mindmapState.nodes, layouts);
      setHoverNodeId(hitNodeId);
      this.engine.markDirty();
      return;
    }

    if (canvasState.interactionMode === 'dragging-node' && this.dragNodeId) {
      // Only start moving the node once the mouse has moved past a small
      // threshold — this distinguishes a click from a drag.
      if (!this.hasDragged) {
        const dx = screenX - this.dragStartScreenX;
        const dy = screenY - this.dragStartScreenY;
        if (Math.sqrt(dx * dx + dy * dy) < this.dragThreshold) {
          return;
        }
        this.hasDragged = true;
      }

      const worldPos = screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);
      const newX = worldPos.x - this.dragNodeOffsetX;
      const newY = worldPos.y - this.dragNodeOffsetY;
      updateNode(this.dragNodeId, { pos_x: newX, pos_y: newY });

      this.detectDropTarget(screenX, screenY);
      this.engine.markDirty();
    } else if (canvasState.interactionMode === 'panning') {
      const dx = screenX - this.dragStartScreenX;
      const dy = screenY - this.dragStartScreenY;
      setPan(this.lastPanX + dx, this.lastPanY + dy);
      this.engine.markDirty();
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Drop target detection
  /* ---------------------------------------------------------------------- */

  private detectDropTarget(screenX: number, screenY: number): void {
    if (!this.dragNodeId) return;

    const dragNode = mindmapState.nodes.get(this.dragNodeId);
    if (!dragNode || dragNode.node_type === 'root') {
      setDropAction('none');
      setDropTargetId(null);
      setReorderInfo(null, null);
      return;
    }

    const layouts = this.engine.getNodeLayouts();
    const worldPos = screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);

    const descendantIds = new Set(collectDescendantIds(this.dragNodeId, mindmapState.nodes));
    let hitNodeId: string | null = null;

    const entries = Array.from(mindmapState.nodes.entries());
    for (let i = entries.length - 1; i >= 0; i--) {
      const [nodeId, node] = entries[i];
      if (nodeId === this.dragNodeId) continue;
      if (descendantIds.has(nodeId)) continue;
      if (!isNodeVisible(nodeId, mindmapState.nodes)) continue;

      const layout = layouts.get(nodeId);
      if (!layout) continue;

      if (
        worldPos.x >= node.pos_x &&
        worldPos.x <= node.pos_x + layout.width &&
        worldPos.y >= node.pos_y &&
        worldPos.y <= node.pos_y + layout.height
      ) {
        hitNodeId = nodeId;
        break;
      }
    }

    if (!hitNodeId) {
      setDropAction('none');
      setDropTargetId(null);
      setReorderInfo(null, null);
      return;
    }

    const hitNode = mindmapState.nodes.get(hitNodeId)!;
    const hitLayout = layouts.get(hitNodeId)!;
    const isSibling =
      dragNode.parent_id !== null &&
      hitNode.parent_id !== null &&
      String(dragNode.parent_id) === String(hitNode.parent_id);

    if (isSibling) {
      const relativeY = worldPos.y - hitNode.pos_y;
      const edgeZone = hitLayout.height * 0.3;

      if (relativeY < edgeZone) {
        setDropAction('reorder');
        setDropTargetId(null);
        setReorderInfo(hitNodeId, 'before');
      } else if (relativeY > hitLayout.height - edgeZone) {
        setDropAction('reorder');
        setDropTargetId(null);
        setReorderInfo(hitNodeId, 'after');
      } else {
        if (isDescendantOf(hitNodeId, this.dragNodeId, mindmapState.nodes)) {
          setDropAction('none');
          setDropTargetId(null);
          setReorderInfo(null, null);
        } else {
          setDropAction('reparent');
          setDropTargetId(hitNodeId);
          setReorderInfo(null, null);
        }
      }
    } else {
      if (isDescendantOf(hitNodeId, this.dragNodeId, mindmapState.nodes)) {
        setDropAction('none');
        setDropTargetId(null);
        setReorderInfo(null, null);
      } else {
        setDropAction('reparent');
        setDropTargetId(hitNodeId);
        setReorderInfo(null, null);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Mouse up
  /* ---------------------------------------------------------------------- */

  private onMouseUp(_e: MouseEvent): void {
    if (canvasState.interactionMode === 'dragging-node' && this.dragNodeId) {
      const dragNode = mindmapState.nodes.get(this.dragNodeId);
      const savedDragNodeId = this.dragNodeId;
      const savedDropAction = canvasState.dropAction;
      const savedDropTargetId = canvasState.dropTargetId;
      const savedReorderSiblingId = canvasState.reorderSiblingId;
      const savedReorderPosition = canvasState.reorderPosition;

      this.isDragging = false;
      this.dragNodeId = null;
      clearDragState();

      if (dragNode && dragNode.node_type !== 'root') {
        if (savedDropAction === 'reparent' && savedDropTargetId) {
          this.executeReparent(savedDragNodeId, savedDropTargetId);
        } else if (savedDropAction === 'reorder' && savedReorderSiblingId && savedReorderPosition) {
          this.executeReorder(savedDragNodeId, savedReorderSiblingId, savedReorderPosition);
        } else if (this.hasDragged) {
          // Snap back: restore only the dragged node to its original position.
          updateNode(savedDragNodeId, {
            pos_x: this.dragOriginalX,
            pos_y: this.dragOriginalY,
          });
        } else {
          // Clean click on a node → expand it only if it has a description.
          // Keep the node at its original position (mouse click = in-viewport).
          const node = mindmapState.nodes.get(savedDragNodeId);
          if (node && node.description) {
            this.engine.startLayoutAnimation(savedDragNodeId, 'keep-position');
          }
        }
      } else if (dragNode && dragNode.node_type === 'root') {
        if (!this.hasDragged && dragNode.description) {
          this.engine.startLayoutAnimation(savedDragNodeId, 'keep-position');
        }
      }
    } else if (canvasState.interactionMode === 'panning') {
      // Click on empty canvas → collapse any expanded node.
      this.isDragging = false;
      this.dragNodeId = null;
      clearDragState();
      this.engine.startLayoutAnimation(null);
    } else {
      this.isDragging = false;
      this.dragNodeId = null;
      clearDragState();
    }

    this.hasDragged = false;
    this.engine.markDirty();
  }

  /* ---------------------------------------------------------------------- */
  //  Reparent execution
  /* ---------------------------------------------------------------------- */

  private async executeReparent(nodeId: string, newParentId: string): Promise<void> {
    const node = mindmapState.nodes.get(nodeId);
    const newParent = mindmapState.nodes.get(newParentId);
    if (!node || !newParent || !mindmapState.mindmap) {
      // Reparent not possible — snap the dragged node back to its original spot.
      updateNode(nodeId, { pos_x: this.dragOriginalX, pos_y: this.dragOriginalY });
      return;
    }

    if (node.parent_id !== null && String(node.parent_id) === newParentId) {
      updateNode(nodeId, { pos_x: this.dragOriginalX, pos_y: this.dragOriginalY });
      return;
    }

    if (isDescendantOf(newParentId, nodeId, mindmapState.nodes)) {
      updateNode(nodeId, { pos_x: this.dragOriginalX, pos_y: this.dragOriginalY });
      return;
    }

    const newLevel = newParent.level + 1;
    const newSortOrder = getNextSortOrder(newParentId, mindmapState.nodes);
    const levelDelta = newLevel - node.level;

    let oldEdgeId: string | null = null;
    for (const [edgeId, edge] of mindmapState.edges) {
      if (
        String(edge.target_node_id) === nodeId &&
        node.parent_id !== null &&
        String(edge.source_node_id) === String(node.parent_id)
      ) {
        oldEdgeId = edgeId;
        break;
      }
    }

    const oldEdge = oldEdgeId ? mindmapState.edges.get(oldEdgeId) ?? null : null;

    try {
      await window.electronAPI.db.updateNode({
        id: node.id,
        parent_id: newParent.id,
        level: newLevel,
        sort_order: newSortOrder,
      });

      if (oldEdgeId && oldEdge) {
        await window.electronAPI.db.deleteEdge(oldEdge.id);
      }

      const createdEdge = (await window.electronAPI.db.createEdge({
        mindmap_id: mindmapState.mindmap.id,
        source_node_id: newParent.id,
        target_node_id: node.id,
        edge_type: 'parent_child',
      })) as Edge;

      recordReparent(
        nodeId,
        node.parent_id,
        node.level,
        node.sort_order,
        oldEdge,
        createdEdge
      );

      const descendantIds = collectDescendantIds(nodeId, mindmapState.nodes);
      for (const descId of descendantIds) {
        const descNode = mindmapState.nodes.get(descId);
        if (descNode) {
          const updatedLevel = descNode.level + levelDelta;
          await window.electronAPI.db.updateNode({ id: descNode.id, level: updatedLevel });
        }
      }

      updateNode(nodeId, {
        parent_id: newParent.id,
        level: newLevel,
        sort_order: newSortOrder,
      });

      if (oldEdgeId) {
        removeEdge(oldEdgeId);
      }

      addEdge(createdEdge);

      for (const descId of descendantIds) {
        const descNode = mindmapState.nodes.get(descId);
        if (descNode) {
          updateNode(descId, { level: descNode.level + levelDelta });
        }
      }

      this.engine.stopLayoutAnimation();
      const laidOutNodes = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
      setNodes(laidOutNodes);
      this.engine.markDirty();
    } catch (err) {
      console.error('Failed to reparent node:', err);
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Reorder execution
  /* ---------------------------------------------------------------------- */

  private async executeReorder(
    nodeId: string,
    siblingId: string,
    position: 'before' | 'after'
  ): Promise<void> {
    const node = mindmapState.nodes.get(nodeId);
    if (!node || node.parent_id === null) return;

    const siblings: string[] = [];
    for (const [id, n] of mindmapState.nodes) {
      if (n.parent_id !== null && String(n.parent_id) === String(node.parent_id)) {
        siblings.push(id);
      }
    }

    siblings.sort((a, b) => {
      const na = mindmapState.nodes.get(a);
      const nb = mindmapState.nodes.get(b);
      return (na?.sort_order ?? 0) - (nb?.sort_order ?? 0);
    });

    const draggedIndex = siblings.indexOf(nodeId);
    if (draggedIndex !== -1) {
      siblings.splice(draggedIndex, 1);
    }

    const targetIndex = siblings.indexOf(siblingId);
    if (targetIndex === -1) return;

    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    siblings.splice(insertIndex, 0, nodeId);

    // Snapshot old sort_orders for undo
    const oldOrders: { nodeId: string; before: number }[] = [];
    for (const sid of siblings) {
      const sn = mindmapState.nodes.get(sid);
      if (sn) oldOrders.push({ nodeId: sid, before: sn.sort_order });
    }

    try {
      for (let i = 0; i < siblings.length; i++) {
        const siblingNodeId = siblings[i];
        const siblingNode = mindmapState.nodes.get(siblingNodeId);
        if (siblingNode) {
          await window.electronAPI.db.updateNode({ id: siblingNode.id, sort_order: i });
          updateNode(siblingNodeId, { sort_order: i });
        }
      }

      recordReorder(oldOrders);

      this.engine.stopLayoutAnimation();
      const laidOutNodes = applyHierarchicalLayout(mindmapState.nodes, mindmapState.edges);
      setNodes(laidOutNodes);
      this.engine.markDirty();
    } catch (err) {
      console.error('Failed to reorder node:', err);
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Wheel (zoom to pointer)
  /* ---------------------------------------------------------------------- */

  private onWheel(e: WheelEvent): void {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const currentZoom = canvasState.zoom;
    const newZoom = Math.max(0.1, Math.min(5, currentZoom * zoomFactor));

    const worldPos = screenToWorld(mouseX, mouseY, canvasState.panX, canvasState.panY, currentZoom);
    const newPanX = mouseX - worldPos.x * newZoom;
    const newPanY = mouseY - worldPos.y * newZoom;

    setZoom(newZoom);
    setPan(newPanX, newPanY);
    this.engine.markDirty();
  }

  /* ---------------------------------------------------------------------- */
  //  Double click
  /* ---------------------------------------------------------------------- */

  private onDblClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const layouts = this.engine.getNodeLayouts();

    // Do not trigger edit if clicking source icon
    const sourceHitId = hitTestSourceIcon(screenX, screenY, mindmapState.nodes, layouts);
    if (sourceHitId) {
      return;
    }

    const hitNodeId = hitTestNode(screenX, screenY, mindmapState.nodes, layouts);

    if (hitNodeId) {
      // Do not trigger edit if clicking collapse/expand button
      if (hitTestCollapseButton(screenX, screenY, hitNodeId, mindmapState.nodes, layouts)) {
        return;
      }

      // Do not trigger edit if clicking pagination controls
      const pageIndex = this.engine.getExpandedNodePage(hitNodeId);
      const paginationHit = hitTestPaginationButton(screenX, screenY, hitNodeId, mindmapState.nodes, layouts, pageIndex);
      if (paginationHit) {
        return;
      }

      if (this.callbacks.onNodeDoubleClick) {
        this.callbacks.onNodeDoubleClick(hitNodeId);
      }
    }

    this.engine.markDirty();
  }

  /* ---------------------------------------------------------------------- */
  //  Context menu
  /* ---------------------------------------------------------------------- */

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const layouts = this.engine.getNodeLayouts();
    const hitNodeId = hitTestNode(screenX, screenY, mindmapState.nodes, layouts);

    if (hitNodeId && this.callbacks.onNodeContextMenu) {
      this.callbacks.onNodeContextMenu(hitNodeId, e.clientX, e.clientY);
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Keyboard
  /* ---------------------------------------------------------------------- */

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        this.handleDeleteSelectedNodes();
        break;
      }
      case '+':
      case '=':
      case '-':
      case '_': {
        e.preventDefault();
        this.handleToggleCollapseSelected();
        break;
      }
      case ' ': {
        e.preventDefault();
        this.handleOpenFullscreenDescription();
        break;
      }
      case 'PageUp': {
        e.preventDefault();
        this.handlePagePrev();
        break;
      }
      case 'PageDown': {
        e.preventDefault();
        this.handlePageNext();
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        this.handleArrowNavigation(e.key);
        break;
      }
      default:
        break;
    }
  }

  private async handleDeleteSelectedNodes(): Promise<void> {
    const selectedIds = Array.from(canvasState.selectedNodeIds);
    if (selectedIds.length === 0) return;

    const idsToDelete = new Set<string>();
    const collectDescendants = (parentId: string): void => {
      for (const [id, node] of mindmapState.nodes) {
        if (node.parent_id !== null && String(node.parent_id) === parentId) {
          idsToDelete.add(id);
          collectDescendants(id);
        }
      }
    };

    for (const id of selectedIds) {
      idsToDelete.add(id);
      collectDescendants(id);
    }

    // Snapshot for undo
    const nodesSnapshot: Node[] = [];
    const edgesSnapshot: Edge[] = [];
    for (const id of idsToDelete) {
      const n = mindmapState.nodes.get(id);
      if (n) nodesSnapshot.push(n);
    }
    for (const [edgeId, edge] of mindmapState.edges) {
      if (
        idsToDelete.has(String(edge.source_node_id)) ||
        idsToDelete.has(String(edge.target_node_id))
      ) {
        edgesSnapshot.push(edge);
      }
    }

    for (const id of idsToDelete) {
      const node = mindmapState.nodes.get(id);
      if (node) {
        try {
          await window.electronAPI.db.deleteNode(node.id);
        } catch (err) {
          console.error('Failed to delete node from DB:', err);
        }
      }
      removeNode(id);
    }

    for (const [edgeId, edge] of mindmapState.edges) {
      if (
        idsToDelete.has(String(edge.source_node_id)) ||
        idsToDelete.has(String(edge.target_node_id))
      ) {
        removeEdge(edgeId);
      }
    }

    recordDeleteSubtree(nodesSnapshot, edgesSnapshot);
    clearSelection();
    this.engine.markDirty();
  }

  private async handleToggleCollapse(nodeId: string): Promise<void> {
    if (!hasChildren(nodeId)) return;

    const node = mindmapState.nodes.get(nodeId);
    if (!node) return;

    const nextCollapsed = node.collapsed === 0 ? 1 : 0;

    try {
      await window.electronAPI.db.updateNode({
        id: node.id,
        collapsed: nextCollapsed === 1,
      });
      recordToggleCollapse(nodeId, node.collapsed);
      updateNode(nodeId, { collapsed: nextCollapsed });

      // Re-apply layout so collapsed subtrees free up space, anchored on
      // the toggled node so the user's focal point doesn't jump.
      this.engine.stopLayoutAnimation();
      const laidOutNodes = applyLayoutWithAnchor(
        mindmapState.nodes,
        mindmapState.edges,
        nodeId,
        this.engine.expandedNodeId ?? undefined
      );
      setNodes(laidOutNodes);

      this.engine.markDirty();
    } catch (err) {
      console.error('Failed to toggle collapse:', err);
    }
  }

  private async handleToggleCollapseSelected(): Promise<void> {
    const selectedIds = Array.from(canvasState.selectedNodeIds);
    if (selectedIds.length !== 1) return;

    const nodeId = selectedIds[0];
    await this.handleToggleCollapse(nodeId);
  }

  private handlePagePrev(): void {
    const selectedIds = Array.from(canvasState.selectedNodeIds);
    if (selectedIds.length !== 1) return;
    const nodeId = selectedIds[0];
    const currentPage = this.engine.getExpandedNodePage(nodeId);
    this.engine.setExpandedNodePage(nodeId, currentPage - 1);
  }

  private handlePageNext(): void {
    const selectedIds = Array.from(canvasState.selectedNodeIds);
    if (selectedIds.length !== 1) return;
    const nodeId = selectedIds[0];
    const currentPage = this.engine.getExpandedNodePage(nodeId);
    this.engine.setExpandedNodePage(nodeId, currentPage + 1);
  }

  private handleOpenFullscreenDescription(): void {
    const selectedIds = Array.from(canvasState.selectedNodeIds);
    if (selectedIds.length !== 1) return;

    const nodeId = selectedIds[0];
    const node = mindmapState.nodes.get(nodeId);
    if (!node || !node.description) return;

    window.dispatchEvent(
      new CustomEvent('fullscreen-description', { detail: { nodeId } })
    );
  }

  private handleArrowNavigation(key: string): void {
    const selectedIds = Array.from(canvasState.selectedNodeIds);
    if (selectedIds.length === 0) return;

    const fromId = selectedIds[0];
    const fromNode = mindmapState.nodes.get(fromId);
    if (!fromNode) return;

    let nextId: string | null = null;

    if (key === 'ArrowLeft') {
      // Navigate to parent
      if (fromNode.parent_id !== null) {
        nextId = String(fromNode.parent_id);
      }
    } else if (key === 'ArrowRight') {
      // Navigate to first child.
      // If the current node itself is collapsed, expand it first, then focus its first child.
      const children = this.getSortedChildren(fromId);
      if (children.length > 0) {
        let targetId = children[0];
        if (fromNode.collapsed === 1) {
          // Expand the current (collapsed) node
          recordToggleCollapse(fromId, fromNode.collapsed);
          updateNode(fromId, { collapsed: 0 });
          // Re-layout so children become visible, anchored on the toggled node
          const laidOut = applyLayoutWithAnchor(mindmapState.nodes, mindmapState.edges, fromId, this.engine.expandedNodeId ?? undefined);
          setNodes(laidOut);
        }
        nextId = targetId;
      }
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      // Navigate between siblings
      if (fromNode.parent_id !== null) {
        const siblings = this.getSortedSiblings(fromId);
        const idx = siblings.indexOf(fromId);
        if (idx !== -1) {
          if (key === 'ArrowUp' && idx > 0) {
            nextId = siblings[idx - 1];
          } else if (key === 'ArrowDown' && idx < siblings.length - 1) {
            nextId = siblings[idx + 1];
          }
        }
      }
    }

    if (nextId) {
      clearSelection();
      selectNode(nextId);

      // Keyboard-navigated nodes are always centered in the viewport
      // so the user can see them even if they were off-screen.
      this.engine.startLayoutAnimation(nextId, 'center-in-viewport');

      this.engine.markDirty();
    }
  }

  private getSortedChildren(parentId: string): string[] {
    const children: string[] = [];
    for (const [id, node] of mindmapState.nodes) {
      if (node.parent_id !== null && String(node.parent_id) === parentId) {
        children.push(id);
      }
    }
    children.sort((a, b) => {
      const na = mindmapState.nodes.get(a);
      const nb = mindmapState.nodes.get(b);
      return (na?.sort_order ?? 0) - (nb?.sort_order ?? 0);
    });
    return children;
  }

  private getSortedSiblings(nodeId: string): string[] {
    const node = mindmapState.nodes.get(nodeId);
    if (!node || node.parent_id === null) return [];

    const siblings: string[] = [];
    for (const [id, n] of mindmapState.nodes) {
      if (n.parent_id !== null && String(n.parent_id) === String(node.parent_id)) {
        siblings.push(id);
      }
    }
    siblings.sort((a, b) => {
      const na = mindmapState.nodes.get(a);
      const nb = mindmapState.nodes.get(b);
      return (na?.sort_order ?? 0) - (nb?.sort_order ?? 0);
    });
    return siblings;
  }

  /* ---------------------------------------------------------------------- */
  //  Cleanup
  /* ---------------------------------------------------------------------- */

  cleanup(): void {
    this.canvas.removeEventListener('mousedown', this.boundOnMouseDown);
    this.canvas.removeEventListener('mousemove', this.boundOnMouseMove);
    this.canvas.removeEventListener('mouseup', this.boundOnMouseUp);
    this.canvas.removeEventListener('wheel', this.boundOnWheel);
    this.canvas.removeEventListener('dblclick', this.boundOnDblClick);
    this.canvas.removeEventListener('contextmenu', this.boundOnContextMenu);
    window.removeEventListener('keydown', this.boundOnKeyDown);
  }
}
