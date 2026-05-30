// ============================================================
// MindSprout — CanvasEngine
// Main rendering loop, dirty-flag system, and world transform
// Supports animated layout transitions when nodes expand/collapse.
// ============================================================

import type { Node } from '@/types';
import { canvasState } from '@/stores/canvasStore';
import { mindmapState, hasChildren, updateNode } from '@/stores/mindmapStore';
import { calculateNodeLayout, calculateExpandedNodeLayout, drawNode, type NodeLayout } from './NodeRenderer';
import { drawEdge } from './EdgeRenderer';
import { getVisibleNodes, screenToWorld, worldToScreen } from './HitTester';
import { applyHierarchicalLayout } from './LayoutEngine';

/* -------------------------------------------------------------------------- */
//  CanvasEngine
/* -------------------------------------------------------------------------- */

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private dirty = true;
  private nodeLayoutCache = new Map<string, NodeLayout>();
  private dpr = 1;

  // Layout animation state
  private animatingLayout = false;
  private animationStartTime = 0;
  private readonly animationDuration = 350;
  private animationTargets = new Map<string, { x: number; y: number }>();
  private animationStarts = new Map<string, { x: number; y: number }>();
  private _expandedNodeId: string | null = null;
  private _expandedNodePageIndex = new Map<string, number>();

  get expandedNodeId(): string | null {
    return this._expandedNodeId;
  }

  getNodeLayout(nodeId: string): NodeLayout | undefined {
    return this.nodeLayoutCache.get(nodeId);
  }

  getNodeLayouts(): Map<string, NodeLayout> {
    return this.nodeLayoutCache;
  }

  setExpandedNodePage(nodeId: string, pageIndex: number): void {
    const layout = this.nodeLayoutCache.get(nodeId);
    const pages = layout?.descriptionPageCount ?? 1;
    const clamped = Math.max(0, Math.min(pageIndex, pages - 1));
    const current = this._expandedNodePageIndex.get(nodeId) ?? 0;
    if (current !== clamped) {
      this._expandedNodePageIndex.set(nodeId, clamped);
      this.invalidateNodeLayout(nodeId);
      this.markDirty();
    }
  }

  getExpandedNodePage(nodeId: string): number {
    return this._expandedNodePageIndex.get(nodeId) ?? 0;
  }

  clearExpandedNodePages(): void {
    this._expandedNodePageIndex.clear();
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;
    this.resize();
  }

  /* ---------------------------------------------------------------------- */
  //  Lifecycle
  /* ---------------------------------------------------------------------- */

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.markDirty();
  }

  start(): void {
    if (this.rafId !== null) return;
    this.dirty = true;
    this.rafId = requestAnimationFrame(() => this.render());
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Dirty-flag system
  /* ---------------------------------------------------------------------- */

  markDirty(): void {
    this.dirty = true;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.render());
    }
  }

  invalidateNodeLayout(nodeId?: string): void {
    if (nodeId) {
      this.nodeLayoutCache.delete(nodeId);
    } else {
      this.nodeLayoutCache.clear();
    }
    this.markDirty();
  }

  /* ---------------------------------------------------------------------- */
  //  Layout animation
  /* ---------------------------------------------------------------------- */

  startLayoutAnimation(
    newExpandedNodeId: string | null,
    anchorMode: 'keep-position' | 'center-in-viewport' = 'keep-position'
  ): void {
    // Ignore redundant calls (e.g. double-click on already-expanded node)
    if (this._expandedNodeId === newExpandedNodeId && !this.animatingLayout) return;

    // Reset page index when switching to a different node
    if (newExpandedNodeId && newExpandedNodeId !== this._expandedNodeId) {
      this._expandedNodePageIndex.set(newExpandedNodeId, 0);
    }

    const now = performance.now();
    const cssWidth = this.canvas.width / this.dpr;
    const cssHeight = this.canvas.height / this.dpr;

    // If already animating, freeze at the *actual* current positions from the
    // store.  setNodes / applyLayoutWithAnchor may have replaced positions
    // since the last frame, so the interpolated value is stale.  Reading from
    // the store guarantees the new animation starts from the true current state.
    for (const [id, node] of mindmapState.nodes) {
      this.animationStarts.set(id, { x: node.pos_x, y: node.pos_y });
    }

    // Compute target positions with the new expanded node size.
    this._expandedNodeId = newExpandedNodeId;
    this.nodeLayoutCache.clear();

    const laidOut = applyHierarchicalLayout(
      mindmapState.nodes,
      mindmapState.edges,
      newExpandedNodeId ?? undefined
    );

    // Apply anchor offset based on anchorMode
    if (newExpandedNodeId && laidOut.has(newExpandedNodeId)) {
      const originalNode = mindmapState.nodes.get(newExpandedNodeId);
      const targetNode = laidOut.get(newExpandedNodeId)!;

      if (anchorMode === 'keep-position' && originalNode) {
        // Mouse click: keep the expanded node exactly where it was.
        const dx = originalNode.pos_x - targetNode.pos_x;
        const dy = originalNode.pos_y - targetNode.pos_y;
        if (dx !== 0 || dy !== 0) {
          for (const [id, node] of laidOut) {
            laidOut.set(id, {
              ...node,
              pos_x: node.pos_x + dx,
              pos_y: node.pos_y + dy,
            });
          }
        }
      } else if (anchorMode === 'center-in-viewport') {
        // Keyboard: move the expanded node to the viewport center.
        const { zoom, panX, panY } = canvasState;
        const worldCenterX = (cssWidth / 2 - panX) / zoom;
        const worldCenterY = (cssHeight / 2 - panY) / zoom;

        const layout = this.nodeLayoutCache.get(newExpandedNodeId)
          ?? calculateExpandedNodeLayout(targetNode);
        const desiredX = worldCenterX - layout.width / 2;
        const desiredY = worldCenterY - layout.height / 2;

        const dx = desiredX - targetNode.pos_x;
        const dy = desiredY - targetNode.pos_y;
        if (dx !== 0 || dy !== 0) {
          for (const [id, node] of laidOut) {
            laidOut.set(id, {
              ...node,
              pos_x: node.pos_x + dx,
              pos_y: node.pos_y + dy,
            });
          }
        }
      }
    }

    this.animationTargets.clear();
    for (const [id, node] of laidOut) {
      this.animationTargets.set(id, { x: node.pos_x, y: node.pos_y });
    }

    this.animatingLayout = true;
    this.animationStartTime = now;
    this.markDirty();
  }

  stopLayoutAnimation(): void {
    this.animatingLayout = false;
  }

  /* ---------------------------------------------------------------------- */
  //  Main render loop
  /* ---------------------------------------------------------------------- */

  private render(): void {
    this.rafId = null;
    if (!this.dirty) return;
    this.dirty = false;

    const ctx = this.ctx;
    const cssWidth = this.canvas.width / this.dpr;
    const cssHeight = this.canvas.height / this.dpr;

    // Step 1: interpolate node positions if a layout animation is running
    this.tickLayoutAnimation();

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    this.drawGrid(cssWidth, cssHeight);

    const { zoom, panX, panY } = canvasState;
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const nodes = mindmapState.nodes;
    const edges = mindmapState.edges;

    // Rebuild layout cache when expanded node changes
    for (const [nodeId, node] of nodes) {
      const isExpanded = nodeId === this._expandedNodeId;
      const cached = this.nodeLayoutCache.get(nodeId);
      const cacheMismatch = cached && ((isExpanded && !cached.isExpanded) || (!isExpanded && cached.isExpanded));
      if (!cached || cacheMismatch) {
        const pageIndex = isExpanded ? this.getExpandedNodePage(nodeId) : 0;
        this.nodeLayoutCache.set(
          nodeId,
          isExpanded ? calculateExpandedNodeLayout(node, pageIndex) : calculateNodeLayout(node)
        );
      }
    }

    const visibleNodeIds = getVisibleNodes(
      nodes,
      this.nodeLayoutCache,
      panX,
      panY,
      zoom,
      cssWidth,
      cssHeight
    );

    const collapsedParentIds = new Set<string>();
    for (const [nodeId, node] of nodes) {
      if (node.collapsed) {
        collapsedParentIds.add(nodeId);
      }
    }

    const logicallyVisibleIds: string[] = [];
    for (const [nodeId, node] of nodes) {
      let current: Node | undefined = node;
      let isVisible = true;
      while (current && current.parent_id !== null) {
        const parentId = String(current.parent_id);
        if (collapsedParentIds.has(parentId)) {
          isVisible = false;
          break;
        }
        current = nodes.get(parentId);
      }
      if (isVisible) {
        logicallyVisibleIds.push(nodeId);
      }
    }
    const logicallyVisibleSet = new Set(logicallyVisibleIds);

    const renderableNodeIds = visibleNodeIds.filter((nodeId) =>
      logicallyVisibleSet.has(nodeId)
    );

    const isDragging = canvasState.interactionMode === 'dragging-node' && canvasState.draggingNodeId !== null;

    for (const edge of edges.values()) {
      const sourceId = String(edge.source_node_id);
      const targetId = String(edge.target_node_id);

      if (!logicallyVisibleSet.has(sourceId) || !logicallyVisibleSet.has(targetId)) continue;

      const sourceNode = nodes.get(sourceId);
      const targetNode = nodes.get(targetId);
      const sourceLayout = this.nodeLayoutCache.get(sourceId);
      const targetLayout = this.nodeLayoutCache.get(targetId);
      if (!sourceNode || !targetNode || !sourceLayout || !targetLayout) continue;

      if (isDragging && targetId === canvasState.draggingNodeId) {
        ctx.globalAlpha = 0.35;
      }

      drawEdge(ctx, edge, sourceNode, targetNode, sourceLayout, targetLayout);

      if (isDragging && targetId === canvasState.draggingNodeId) {
        ctx.globalAlpha = 1;
      }
    }

    for (const nodeId of renderableNodeIds) {
      const node = nodes.get(nodeId);
      const layout = this.nodeLayoutCache.get(nodeId);
      if (!node || !layout) continue;

      const isSelected = canvasState.selectedNodeIds.has(nodeId);
      const isHovered = canvasState.hoverNodeId === nodeId;
      const isDragged = isDragging && canvasState.draggingNodeId === nodeId;
      const isDropTarget = canvasState.dropAction === 'reparent' && canvasState.dropTargetId === nodeId;
      const nodeHasChildren = hasChildren(nodeId);

      if (isDragged) {
        ctx.globalAlpha = 0.7;
      }

      const pageIndex = isSelected ? this.getExpandedNodePage(nodeId) : 0;
      drawNode(ctx, node, layout, isSelected, isHovered, nodeHasChildren, isDropTarget, pageIndex);

      if (isDragged) {
        ctx.globalAlpha = 1;
      }
    }

    if (canvasState.dropAction === 'reorder' && canvasState.reorderSiblingId) {
      this.drawReorderIndicator(ctx, canvasState.reorderSiblingId, canvasState.reorderPosition);
    }

    ctx.restore();
  }

  /* ---------------------------------------------------------------------- */
  //  Layout animation tick
  /* ---------------------------------------------------------------------- */

  private tickLayoutAnimation(): void {
    if (!this.animatingLayout) return;

    const now = performance.now();
    const elapsed = now - this.animationStartTime;
    const progress = Math.min(1, elapsed / this.animationDuration);
    const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out

    for (const [id, start] of this.animationStarts) {
      const target = this.animationTargets.get(id);
      if (!target) continue;

      const newX = start.x + (target.x - start.x) * eased;
      const newY = start.y + (target.y - start.y) * eased;
      updateNode(id, { pos_x: newX, pos_y: newY });
    }

    if (progress >= 1) {
      this.animatingLayout = false;
    } else {
      this.markDirty();
    }
  }

  /* ---------------------------------------------------------------------- */
  //  Reorder insertion indicator
  /* ---------------------------------------------------------------------- */

  private drawReorderIndicator(
    ctx: CanvasRenderingContext2D,
    siblingId: string,
    position: 'before' | 'after' | null
  ): void {
    if (!position) return;

    const siblingNode = mindmapState.nodes.get(siblingId);
    const siblingLayout = this.nodeLayoutCache.get(siblingId);
    if (!siblingNode || !siblingLayout) return;

    const lineY = position === 'before'
      ? siblingNode.pos_y - 4
      : siblingNode.pos_y + siblingLayout.height + 4;

    const lineStartX = siblingNode.pos_x - 8;
    const lineEndX = siblingNode.pos_x + siblingLayout.width + 8;

    ctx.save();
    ctx.strokeStyle = '#1976d2';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineY);
    ctx.lineTo(lineEndX, lineY);
    ctx.stroke();

    ctx.fillStyle = '#1976d2';
    ctx.beginPath();
    ctx.arc(lineStartX, lineY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lineEndX, lineY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------------------------------------------------------------- */
  //  Grid
  /* ---------------------------------------------------------------------- */

  private drawGrid(width: number, height: number): void {
    const ctx = this.ctx;
    const gridSize = 40;
    const { zoom, panX, panY } = canvasState;

    const scaledGrid = gridSize * zoom;
    const offsetX = panX % scaledGrid;
    const offsetY = panY % scaledGrid;

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = offsetX; x < width; x += scaledGrid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += scaledGrid) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  /* ---------------------------------------------------------------------- */
  //  Coordinate helpers
  /* ---------------------------------------------------------------------- */

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return screenToWorld(screenX, screenY, canvasState.panX, canvasState.panY, canvasState.zoom);
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return worldToScreen(worldX, worldY, canvasState.panX, canvasState.panY, canvasState.zoom);
  }
}
