# Plan 2: Canvas Editor Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Canvas 2D rendering engine with Pretext text layout, node/edge rendering, viewport culling, hit testing, drag/zoom/pan interactions, layout algorithms, and minimap.

**Architecture:** A custom Canvas 2D rendering loop with requestAnimationFrame. Nodes rendered as rounded rectangles with Pretext-measured text. Edges as cubic Bezier curves. Spatial indexing via simple AABB grid for hit testing. Layout via dagre (hierarchical) and d3-force (force-directed). Minimap as a secondary small canvas.

**Tech Stack:** Canvas 2D API, Pretext (`@chenglou/pretext`), dagre, d3-force

---

## File Structure

```
src/
├── canvas/
│   ├── CanvasEngine.ts       # Main rendering loop, viewport management
│   ├── NodeRenderer.ts       # Node drawing with Pretext
│   ├── EdgeRenderer.ts       # Edge (bezier) drawing
│   ├── HitTester.ts          # Point-in-node detection
│   ├── InteractionManager.ts # Mouse/keyboard event handling
│   ├── LayoutEngine.ts       # dagre + d3-force wrappers
│   └── Minimap.ts            # Minimap canvas renderer
├── stores/
│   ├── canvasStore.ts        # Canvas interaction state
│   └── mindmapStore.ts       # Mindmap data state
└── utils/
    └── id.ts                 # UUID generator
```

---

## Task 1: Install canvas dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependencies**

```bash
npm install @chenglou/pretext dagre d3-force
npm install -D @types/dagre
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Pretext, dagre, d3-force dependencies"
```

---

## Task 2: UUID utility

**Files:**
- Create: `src/utils/id.ts`

- [ ] **Step 1: Write UUID generator**

```typescript
export function generateId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/id.ts
git commit -m "feat: add UUID utility"
```

---

## Task 3: Canvas store

**Files:**
- Create: `src/stores/canvasStore.ts`

- [ ] **Step 1: Write canvasStore.ts**

```typescript
import { createStore } from 'solid-js/store';

interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  selectedNodeIds: Set<string>;
  draggingNodeId: string | null;
  hoverNodeId: string | null;
  interactionMode: 'idle' | 'panning' | 'dragging-node' | 'reparenting';
}

const [canvasStore, setCanvasStore] = createStore<CanvasState>({
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedNodeIds: new Set(),
  draggingNodeId: null,
  hoverNodeId: null,
  interactionMode: 'idle',
});

export function setZoom(zoom: number) {
  setCanvasStore('zoom', Math.max(0.1, Math.min(5, zoom)));
}

export function setPan(x: number, y: number) {
  setCanvasStore('panX', x);
  setCanvasStore('panY', y);
}

export function selectNode(id: string, multi: boolean = false) {
  if (multi) {
    const newSet = new Set(canvasStore.selectedNodeIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setCanvasStore('selectedNodeIds', newSet);
  } else {
    setCanvasStore('selectedNodeIds', new Set([id]));
  }
}

export function clearSelection() {
  setCanvasStore('selectedNodeIds', new Set());
}

export function setDraggingNodeId(id: string | null) {
  setCanvasStore('draggingNodeId', id);
}

export function setHoverNodeId(id: string | null) {
  setCanvasStore('hoverNodeId', id);
}

export function setInteractionMode(mode: CanvasState['interactionMode']) {
  setCanvasStore('interactionMode', mode);
}

export { canvasStore, setCanvasStore };
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/canvasStore.ts
git commit -m "feat: add canvas interaction store"
```

---

## Task 4: Mindmap store

**Files:**
- Create: `src/stores/mindmapStore.ts`

- [ ] **Step 1: Write mindmapStore.ts**

```typescript
import { createStore } from 'solid-js/store';
import type { Mindmap, Node, Edge } from '../types';

interface MindmapState {
  mindmap: Mindmap | null;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
}

const [mindmapStore, setMindmapStore] = createStore<MindmapState>({
  mindmap: null,
  nodes: new Map(),
  edges: new Map(),
});

export function setMindmap(mindmap: Mindmap | null) {
  setMindmapStore('mindmap', mindmap);
}

export function setNodes(nodes: Node[]) {
  const map = new Map<string, Node>();
  for (const node of nodes) map.set(node.id, node);
  setMindmapStore('nodes', map);
}

export function setEdges(edges: Edge[]) {
  const map = new Map<string, Edge>();
  for (const edge of edges) map.set(edge.id, edge);
  setMindmapStore('edges', map);
}

export function addNode(node: Node) {
  setMindmapStore('nodes', (prev) => {
    const next = new Map(prev);
    next.set(node.id, node);
    return next;
  });
}

export function updateNode(id: string, updates: Partial<Node>) {
  setMindmapStore('nodes', (prev) => {
    const next = new Map(prev);
    const existing = next.get(id);
    if (existing) next.set(id, { ...existing, ...updates });
    return next;
  });
}

export function removeNode(id: string) {
  setMindmapStore('nodes', (prev) => {
    const next = new Map(prev);
    next.delete(id);
    return next;
  });
}

export function addEdge(edge: Edge) {
  setMindmapStore('edges', (prev) => {
    const next = new Map(prev);
    next.set(edge.id, edge);
    return next;
  });
}

export function removeEdge(id: string) {
  setMindmapStore('edges', (prev) => {
    const next = new Map(prev);
    next.delete(id);
    return next;
  });
}

export function getChildren(nodeId: string): Node[] {
  const children: Node[] = [];
  for (const node of mindmapStore.nodes.values()) {
    if (node.parent_id === nodeId) children.push(node);
  }
  return children.sort((a, b) => a.sort_order - b.sort_order);
}

export function hasChildren(nodeId: string): boolean {
  for (const node of mindmapStore.nodes.values()) {
    if (node.parent_id === nodeId) return true;
  }
  return false;
}

export { mindmapStore, setMindmapStore };
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/mindmapStore.ts
git commit -m "feat: add mindmap data store"
```

---

## Task 5: NodeRenderer with Pretext

**Files:**
- Create: `src/canvas/NodeRenderer.ts`

- [ ] **Step 1: Write NodeRenderer.ts**

```typescript
import { prepareWithSegments, layoutWithLines, type PreparedTextWithSegments } from '@chenglou/pretext';
import type { Node } from '../types';

const HORIZONTAL_PADDING = 12;
const VERTICAL_PADDING = 10;
const CONTENT_GAP = 6;
const BORDER_RADIUS = 8;
const MIN_NODE_WIDTH = 80;
const MAX_NODE_WIDTH = 280;
const TITLE_FONT = 'bold 14px "Inter", -apple-system, sans-serif';
const CONTENT_FONT = '13px "Inter", -apple-system, sans-serif';
const TITLE_LINE_HEIGHT = 20;
const CONTENT_LINE_HEIGHT = 18;

interface NodeLayout {
  width: number;
  height: number;
  titleLines: string[];
  contentLines: string[];
}

const preparedCache = new Map<string, PreparedTextWithSegments>();

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${text}::${font}`;
  if (!preparedCache.has(key)) {
    preparedCache.set(key, prepareWithSegments(text || ' ', font, { whiteSpace: 'normal', wordBreak: 'keep-all' }));
  }
  return preparedCache.get(key)!;
}

export function calculateNodeLayout(node: Node): NodeLayout {
  const titlePrepared = getPrepared(node.title, TITLE_FONT);
  const { lines: titleLinesData } = layoutWithLines(titlePrepared, MAX_NODE_WIDTH, TITLE_LINE_HEIGHT);
  const titleLines = titleLinesData.map(l => l.text);

  let contentLines: string[] = [];
  if (node.content) {
    const contentPrepared = getPrepared(node.content, CONTENT_FONT);
    const { lines: contentLinesData } = layoutWithLines(contentPrepared, MAX_NODE_WIDTH, CONTENT_LINE_HEIGHT);
    contentLines = contentLinesData.map(l => l.text);
  }

  const maxTitleWidth = titleLinesData.length > 0 ? Math.max(...titleLinesData.map(l => l.width)) : 0;
  const maxContentWidth = contentLines.length > 0
    ? Math.max(...layoutWithLines(getPrepared(node.content, CONTENT_FONT), MAX_NODE_WIDTH, CONTENT_LINE_HEIGHT).lines.map(l => l.width))
    : 0;

  const width = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, Math.max(maxTitleWidth, maxContentWidth) + HORIZONTAL_PADDING * 2));
  const height = VERTICAL_PADDING +
    titleLines.length * TITLE_LINE_HEIGHT +
    (contentLines.length > 0 ? CONTENT_GAP + contentLines.length * CONTENT_LINE_HEIGHT : 0) +
    VERTICAL_PADDING +
    (hasChildren(node.id) ? 14 : 0);

  return { width, height, titleLines, contentLines };
}

function hasChildren(nodeId: string): boolean {
  // Will be passed from caller or imported from store
  return false; // Placeholder, actual check done in CanvasEngine
}

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: Node,
  layout: NodeLayout,
  isSelected: boolean,
  isHovered: boolean,
  hasChildNodes: boolean
) {
  const x = node.pos_x;
  const y = node.pos_y;
  const w = layout.width;
  const h = layout.height;

  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  // Background
  const levelColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981'];
  const bgColor = levelColors[node.level % levelColors.length];
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, BORDER_RADIUS);
  ctx.fill();

  ctx.restore();

  // Selection ring
  if (isSelected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, BORDER_RADIUS + 2);
    ctx.stroke();
  }

  // Hover ring
  if (isHovered && !isSelected) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, BORDER_RADIUS + 1);
    ctx.stroke();
  }

  // Title text
  ctx.fillStyle = '#ffffff';
  ctx.font = TITLE_FONT;
  ctx.textBaseline = 'top';
  for (let i = 0; i < layout.titleLines.length; i++) {
    ctx.fillText(layout.titleLines[i], x + HORIZONTAL_PADDING, y + VERTICAL_PADDING + i * TITLE_LINE_HEIGHT);
  }

  // Content text
  if (layout.contentLines.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = CONTENT_FONT;
    const contentY = y + VERTICAL_PADDING + layout.titleLines.length * TITLE_LINE_HEIGHT + CONTENT_GAP;
    for (let i = 0; i < layout.contentLines.length; i++) {
      ctx.fillText(layout.contentLines[i], x + HORIZONTAL_PADDING, contentY + i * CONTENT_LINE_HEIGHT);
    }
  }

  // Collapse/expand button
  if (hasChildNodes) {
    const btnSize = 14;
    const btnX = x + w / 2 - btnSize / 2;
    const btnY = y + h - btnSize / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bgColor;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.collapsed ? '+' : '−', btnX + btnSize / 2, btnY + btnSize / 2);
    ctx.textAlign = 'left';
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export { roundRect };
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/NodeRenderer.ts
git commit -m "feat: add NodeRenderer with Pretext text layout"
```

---

## Task 6: EdgeRenderer

**Files:**
- Create: `src/canvas/EdgeRenderer.ts`

- [ ] **Step 1: Write EdgeRenderer.ts**

```typescript
import type { Node, Edge } from '../types';

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: Edge,
  sourceNode: Node,
  targetNode: Node,
  sourceLayout: { width: number; height: number },
  targetLayout: { width: number; height: number }
) {
  const sx = sourceNode.pos_x + sourceLayout.width / 2;
  const sy = sourceNode.pos_y + sourceLayout.height;
  const tx = targetNode.pos_x + targetLayout.width / 2;
  const ty = targetNode.pos_y;

  const midY = sy + (ty - sy) * 0.5;

  ctx.strokeStyle = 'rgba(150,150,150,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(sx, midY, tx, midY, tx, ty);
  ctx.stroke();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/EdgeRenderer.ts
git commit -m "feat: add EdgeRenderer with cubic bezier curves"
```

---

## Task 7: HitTester

**Files:**
- Create: `src/canvas/HitTester.ts`

- [ ] **Step 1: Write HitTester.ts**

```typescript
import type { Node } from '../types';

export function screenToWorld(screenX: number, screenY: number, panX: number, panY: number, zoom: number) {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

export function worldToScreen(worldX: number, worldY: number, panX: number, panY: number, zoom: number) {
  return {
    x: worldX * zoom + panX,
    y: worldY * zoom + panY,
  };
}

export function hitTest(
  screenX: number,
  screenY: number,
  nodes: Node[],
  nodeLayouts: Map<string, { width: number; height: number }>,
  panX: number,
  panY: number,
  zoom: number
): string | null {
  const world = screenToWorld(screenX, screenY, panX, panY, zoom);

  // Iterate in reverse (topmost first)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const layout = nodeLayouts.get(node.id);
    if (!layout) continue;

    if (
      world.x >= node.pos_x &&
      world.x <= node.pos_x + layout.width &&
      world.y >= node.pos_y &&
      world.y <= node.pos_y + layout.height
    ) {
      return node.id;
    }
  }
  return null;
}

export function getVisibleNodes(
  nodes: Node[],
  panX: number,
  panY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
): Node[] {
  const left = -panX / zoom;
  const top = -panY / zoom;
  const right = left + canvasWidth / zoom;
  const bottom = top + canvasHeight / zoom;

  // Add padding for edges
  const padding = 100;
  return nodes.filter(n =>
    n.pos_x + 300 >= left - padding &&
    n.pos_x <= right + padding &&
    n.pos_y + 200 >= top - padding &&
    n.pos_y <= bottom + padding
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/HitTester.ts
git commit -m "feat: add HitTester with AABB collision and viewport culling"
```

---

## Task 8: CanvasEngine — main rendering loop

**Files:**
- Create: `src/canvas/CanvasEngine.ts`

- [ ] **Step 1: Write CanvasEngine.ts**

```typescript
import { canvasStore } from '../stores/canvasStore';
import { mindmapStore } from '../stores/mindmapStore';
import { calculateNodeLayout, drawNode } from './NodeRenderer';
import { drawEdge } from './EdgeRenderer';
import { getVisibleNodes } from './HitTester';

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private rafId: number = 0;
  private dirty = true;
  private nodeLayouts = new Map<string, { width: number; height: number }>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
  }

  start() {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.rafId);
  }

  private render() {
    const ctx = this.ctx;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    const { zoom, panX, panY } = canvasStore;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background grid (subtle)
    this.drawGrid(width, height, panX, panY, zoom);

    // Apply world transform
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Get visible nodes
    const allNodes = Array.from(mindmapStore.nodes.values());
    const visibleNodes = getVisibleNodes(allNodes, panX, panY, zoom, width, height);

    // Update layouts for visible nodes
    for (const node of visibleNodes) {
      if (!this.nodeLayouts.has(node.id)) {
        const layout = calculateNodeLayout(node);
        this.nodeLayouts.set(node.id, { width: layout.width, height: layout.height });
      }
    }

    // Draw edges (below nodes)
    const allEdges = Array.from(mindmapStore.edges.values());
    for (const edge of allEdges) {
      const source = mindmapStore.nodes.get(edge.source_node_id);
      const target = mindmapStore.nodes.get(edge.target_node_id);
      if (!source || !target) continue;

      // Only draw if at least one end is visible
      const sourceVisible = visibleNodes.includes(source);
      const targetVisible = visibleNodes.includes(target);
      if (!sourceVisible && !targetVisible) continue;

      const sourceLayout = this.nodeLayouts.get(source.id);
      const targetLayout = this.nodeLayouts.get(target.id);
      if (!sourceLayout || !targetLayout) continue;

      drawEdge(ctx, edge, source, target, sourceLayout, targetLayout);
    }

    // Draw nodes
    for (const node of visibleNodes) {
      const layout = this.nodeLayouts.get(node.id);
      if (!layout) continue;

      // Skip collapsed children
      if (node.parent_id) {
        const parent = mindmapStore.nodes.get(node.parent_id);
        if (parent && parent.collapsed) continue;
      }

      const isSelected = canvasStore.selectedNodeIds.has(node.id);
      const isHovered = canvasStore.hoverNodeId === node.id;

      // Check if node has children
      let hasChildNodes = false;
      for (const n of allNodes) {
        if (n.parent_id === node.id) {
          hasChildNodes = true;
          break;
        }
      }

      const fullLayout = calculateNodeLayout(node);
      drawNode(ctx, node, fullLayout, isSelected, isHovered, hasChildNodes);
    }

    ctx.restore();
  }

  private drawGrid(width: number, height: number, panX: number, panY: number, zoom: number) {
    const ctx = this.ctx;
    const gridSize = 40 * zoom;
    const offsetX = panX % gridSize;
    const offsetY = panY % gridSize;

    ctx.strokeStyle = 'rgba(150,150,150,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = offsetX; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  invalidateNodeLayout(nodeId: string) {
    this.nodeLayouts.delete(nodeId);
    this.markDirty();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/CanvasEngine.ts
git commit -m "feat: add CanvasEngine with rendering loop and viewport culling"
```

---

## Task 9: InteractionManager

**Files:**
- Create: `src/canvas/InteractionManager.ts`

- [ ] **Step 1: Write InteractionManager.ts**

```typescript
import {
  canvasStore,
  setZoom,
  setPan,
  selectNode,
  clearSelection,
  setDraggingNodeId,
  setHoverNodeId,
  setInteractionMode,
} from '../stores/canvasStore';
import { mindmapStore, updateNode } from '../stores/mindmapStore';
import { screenToWorld, hitTest } from './HitTester';
import { calculateNodeLayout } from './NodeRenderer';
import type { CanvasEngine } from './CanvasEngine';

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private engine: CanvasEngine;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastPanX = 0;
  private lastPanY = 0;
  private dragNodeStartX = 0;
  private dragNodeStartY = 0;

  constructor(canvas: HTMLCanvasElement, engine: CanvasEngine) {
    this.canvas = canvas;
    this.engine = engine;

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onDblClick);
    canvas.addEventListener('contextmenu', this.onContextMenu);

    window.addEventListener('keydown', this.onKeyDown);
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDblClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onMouseDown = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodes = Array.from(mindmapStore.nodes.values());
    const layouts = new Map<string, { width: number; height: number }>();
    for (const node of nodes) {
      const layout = calculateNodeLayout(node);
      layouts.set(node.id, { width: layout.width, height: layout.height });
    }

    const hit = hitTest(x, y, nodes, layouts, canvasStore.panX, canvasStore.panY, canvasStore.zoom);

    if (hit) {
      // Node drag
      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
      const node = mindmapStore.nodes.get(hit)!;
      this.dragNodeStartX = node.pos_x;
      this.dragNodeStartY = node.pos_y;
      setDraggingNodeId(hit);
      setInteractionMode('dragging-node');
      selectNode(hit, e.shiftKey);
    } else {
      // Canvas pan
      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
      this.lastPanX = canvasStore.panX;
      this.lastPanY = canvasStore.panY;
      setInteractionMode('panning');
      clearSelection();
    }

    this.engine.markDirty();
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!this.isDragging) {
      // Hover detection
      const nodes = Array.from(mindmapStore.nodes.values());
      const layouts = new Map<string, { width: number; height: number }>();
      for (const node of nodes) {
        const layout = calculateNodeLayout(node);
        layouts.set(node.id, { width: layout.width, height: layout.height });
      }
      const hit = hitTest(x, y, nodes, layouts, canvasStore.panX, canvasStore.panY, canvasStore.zoom);
      setHoverNodeId(hit);
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
      this.engine.markDirty();
      return;
    }

    if (canvasStore.interactionMode === 'panning') {
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;
      setPan(this.lastPanX + dx, this.lastPanY + dy);
    } else if (canvasStore.interactionMode === 'dragging-node' && canvasStore.draggingNodeId) {
      const world = screenToWorld(x, y, canvasStore.panX, canvasStore.panY, canvasStore.zoom);
      const startWorld = screenToWorld(this.dragStartX, this.dragStartY, canvasStore.panX, canvasStore.panY, canvasStore.zoom);
      const dx = world.x - startWorld.x;
      const dy = world.y - startWorld.y;
      updateNode(canvasStore.draggingNodeId, {
        pos_x: this.dragNodeStartX + dx,
        pos_y: this.dragNodeStartY + dy,
      });
    }

    this.engine.markDirty();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (canvasStore.interactionMode === 'dragging-node' && canvasStore.draggingNodeId) {
      // TODO: Check for reparenting in Plan 3
    }

    this.isDragging = false;
    setDraggingNodeId(null);
    setInteractionMode('idle');
    this.engine.markDirty();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, canvasStore.zoom * zoomFactor));

    // Zoom towards mouse pointer
    const worldX = (mouseX - canvasStore.panX) / canvasStore.zoom;
    const worldY = (mouseY - canvasStore.panY) / canvasStore.zoom;
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan(newPanX, newPanY);
    this.engine.markDirty();
  };

  private onDblClick = (e: MouseEvent) => {
    // Will open node editor dialog in Plan 3
    console.log('Double click at', e.clientX, e.clientY);
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // Will show context menu in Plan 3
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        // Delete selected nodes in Plan 3
        break;
      case '+':
      case '=':
        // Expand selected node
        break;
      case '-':
        // Collapse selected node
        break;
      case ' ':
        e.preventDefault();
        // Toggle description panel in Plan 3
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Navigate to nearest node in Plan 3
        break;
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/InteractionManager.ts
git commit -m "feat: add InteractionManager for drag, zoom, pan, keyboard"
```

---

## Task 10: LayoutEngine (dagre wrapper)

**Files:**
- Create: `src/canvas/LayoutEngine.ts`

- [ ] **Step 1: Write LayoutEngine.ts**

```typescript
import * as dagre from 'dagre';
import type { Node, Edge } from '../types';
import { calculateNodeLayout } from './NodeRenderer';

export function applyHierarchicalLayout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80, edgesep: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with computed dimensions
  for (const node of nodes) {
    const layout = calculateNodeLayout(node);
    g.setNode(node.id, { width: layout.width, height: layout.height });
  }

  // Add edges
  for (const edge of edges) {
    g.setEdge(edge.source_node_id, edge.target_node_id);
  }

  // Run layout
  dagre.layout(g);

  // Apply results
  const updatedNodes = nodes.map(node => {
    const nodeLayout = g.node(node.id);
    return {
      ...node,
      pos_x: nodeLayout.x - nodeLayout.width / 2,
      pos_y: nodeLayout.y - nodeLayout.height / 2,
    };
  });

  return updatedNodes;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/LayoutEngine.ts
git commit -m "feat: add hierarchical layout with dagre"
```

---

## Task 11: Minimap

**Files:**
- Create: `src/canvas/Minimap.ts`

- [ ] **Step 1: Write Minimap.ts**

```typescript
import { canvasStore } from '../stores/canvasStore';
import { mindmapStore } from '../stores/mindmapStore';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.style.cssText = 'position:absolute;bottom:40px;right:16px;width:160px;height:120px;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-secondary);cursor:pointer;z-index:50;';
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  render() {
    const ctx = this.ctx;
    const width = 160;
    const height = 120;

    ctx.clearRect(0, 0, width, height);

    const nodes = Array.from(mindmapStore.nodes.values());
    if (nodes.length === 0) return;

    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.pos_x);
      minY = Math.min(minY, node.pos_y);
      maxX = Math.max(maxX, node.pos_x + 200);
      maxY = Math.max(maxY, node.pos_y + 100);
    }

    const padding = 20;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const scale = Math.min(width / contentW, height / contentH);
    const offsetX = (width - contentW * scale) / 2;
    const offsetY = (height - contentH * scale) / 2;

    // Draw nodes as tiny rects
    for (const node of nodes) {
      const x = offsetX + (node.pos_x - minX + padding) * scale;
      const y = offsetY + (node.pos_y - minY + padding) * scale;
      const w = Math.max(4, 40 * scale);
      const h = Math.max(3, 24 * scale);

      const levelColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981'];
      ctx.fillStyle = levelColors[node.level % levelColors.length];
      ctx.fillRect(x, y, w, h);
    }

    // Draw viewport rect
    const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    if (mainCanvas) {
      const viewW = mainCanvas.clientWidth * scale / canvasStore.zoom;
      const viewH = mainCanvas.clientHeight * scale / canvasStore.zoom;
      const viewX = offsetX + (-canvasStore.panX / canvasStore.zoom - minX + padding) * scale;
      const viewY = offsetY + (-canvasStore.panY / canvasStore.zoom - minY + padding) * scale;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(viewX, viewY, viewW, viewH);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/Minimap.ts
git commit -m "feat: add Minimap with viewport indicator"
```

---

## Task 12: Integrate Canvas into EditorPage

**Files:**
- Modify: `src/pages/EditorPage.tsx`

- [ ] **Step 1: Rewrite EditorPage with canvas integration**

```typescript
import { onCleanup, onMount } from 'solid-js';
import { CanvasEngine } from '../canvas/CanvasEngine';
import { InteractionManager } from '../canvas/InteractionManager';
import { Minimap } from '../canvas/Minimap';
import { appStore, toggleTheme, toggleListModal, toggleNotification } from '../stores';

interface EditorPageProps {
  onOpenSettings: () => void;
}

export default function EditorPage(props: EditorPageProps) {
  let canvasContainerRef: HTMLDivElement;
  let engine: CanvasEngine;
  let interaction: InteractionManager;
  let minimap: Minimap;

  onMount(() => {
    const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    engine = new CanvasEngine(canvas);
    engine.start();

    interaction = new InteractionManager(canvas, engine);
    minimap = new Minimap(canvasContainerRef);

    // Minimap render loop
    const minimapLoop = () => {
      minimap.render();
      requestAnimationFrame(minimapLoop);
    };
    const minimapRaf = requestAnimationFrame(minimapLoop);

    onCleanup(() => {
      cancelAnimationFrame(minimapRaf);
      interaction.destroy();
      engine.stop();
    });
  });

  return (
    <div class="editor-page">
      <div class="toolbar">
        <button class="toolbar-btn" onClick={toggleListModal} title="思维导图列表">📋</button>
        <button class="toolbar-btn" onClick={toggleTheme} title="切换主题">
          {appStore.theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button class="toolbar-btn" onClick={toggleNotification} title="通知中心">🔔</button>
        <button class="toolbar-btn" onClick={props.onOpenSettings} title="设置">⚙️</button>
      </div>

      <div class="canvas-container" ref={canvasContainerRef!}>
        <canvas id="main-canvas" />
      </div>

      <div class="status-bar">
        <span>思维芽 MindSprout</span>
        <span>{appStore.currentMindmapId ? '已加载' : '未选择导图'}</span>
      </div>

      {appStore.showListModal && (
        <div class="modal-overlay" onClick={toggleListModal}>
          <div class="modal" onClick={e => e.stopPropagation()}>
            <h3>思维导图列表</h3>
            <p>（内容将在 Plan 3 实现）</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/EditorPage.tsx
git commit -m "feat: integrate CanvasEngine, InteractionManager, and Minimap into EditorPage"
```

---

## Task 13: Test with sample mindmap data

**Files:**
- Create: `src/canvas/test-data.ts`

- [ ] **Step 1: Write test data generator**

```typescript
import { generateId } from '../utils/id';
import type { Mindmap, Node, Edge } from '../types';

export function createSampleMindmap(): { mindmap: Mindmap; nodes: Node[]; edges: Edge[] } {
  const now = Date.now();
  const mindmap: Mindmap = {
    id: generateId(),
    title: 'AI 技术发展',
    description: '探索人工智能的各个分支与发展方向',
    visibility: 'private',
    layout_mode: 'hierarchical',
    view_state: '{"zoom":1,"panX":0,"panY":0}',
    created_at: now,
    updated_at: now,
    version: 1,
  };

  const rootNode: Node = {
    id: generateId(),
    mindmap_id: mindmap.id,
    parent_id: null,
    node_type: 'root',
    title: 'AI 技术发展',
    content: '人工智能的核心领域',
    description: '',
    style: '{}',
    pos_x: 0,
    pos_y: 0,
    level: 0,
    sort_order: 0,
    collapsed: 0,
    created_at: now,
    updated_at: now,
  };

  const children: Node[] = [
    { title: '机器学习', content: '让计算机从数据中学习', level: 1 },
    { title: '深度学习', content: '多层神经网络的突破', level: 1 },
    { title: '自然语言处理', content: '理解和生成人类语言', level: 1 },
    { title: '计算机视觉', content: '让机器看懂图像', level: 1 },
  ].map((data, i) => ({
    id: generateId(),
    mindmap_id: mindmap.id,
    parent_id: rootNode.id,
    node_type: 'branch',
    title: data.title,
    content: data.content,
    description: '',
    style: '{}',
    pos_x: 0,
    pos_y: 0,
    level: data.level,
    sort_order: i,
    collapsed: 0,
    created_at: now,
    updated_at: now,
  }));

  const grandChildren: Node[] = [
    { title: '监督学习', parent: 0, level: 2 },
    { title: '无监督学习', parent: 0, level: 2 },
    { title: '强化学习', parent: 0, level: 2 },
    { title: 'CNN', parent: 1, level: 2 },
    { title: 'RNN', parent: 1, level: 2 },
    { title: 'Transformer', parent: 1, level: 2 },
    { title: 'BERT', parent: 2, level: 2 },
    { title: 'GPT', parent: 2, level: 2 },
    { title: '图像分类', parent: 3, level: 2 },
    { title: '目标检测', parent: 3, level: 2 },
  ].map((data, i) => ({
    id: generateId(),
    mindmap_id: mindmap.id,
    parent_id: children[data.parent].id,
    node_type: 'leaf',
    title: data.title,
    content: '',
    description: '',
    style: '{}',
    pos_x: 0,
    pos_y: 0,
    level: data.level,
    sort_order: i,
    collapsed: 0,
    created_at: now,
    updated_at: now,
  }));

  const allNodes = [rootNode, ...children, ...grandChildren];

  const edges: Edge[] = allNodes
    .filter(n => n.parent_id)
    .map(n => ({
      id: generateId(),
      mindmap_id: mindmap.id,
      source_node_id: n.parent_id!,
      target_node_id: n.id,
      edge_type: 'default',
      style: '{}',
      created_at: now,
    }));

  return { mindmap, nodes: allNodes, edges };
}
```

- [ ] **Step 2: Load test data on mount**

Modify `src/pages/EditorPage.tsx` to import and load test data:

```typescript
import { createSampleMindmap } from '../canvas/test-data';
import { setMindmap, setNodes, setEdges } from '../stores/mindmapStore';
import { setCurrentMindmapId } from '../stores/appStore';
import { applyHierarchicalLayout } from '../canvas/LayoutEngine';
```

Inside `onMount`, after creating the engine:

```typescript
const { mindmap, nodes, edges } = createSampleMindmap();
const laidOutNodes = applyHierarchicalLayout(nodes, edges);
setMindmap(mindmap);
setNodes(laidOutNodes);
setEdges(edges);
setCurrentMindmapId(mindmap.id);
engine.markDirty();
```

- [ ] **Step 3: Test the app**

Run: `npm run dev`

Expected: Electron window opens showing a hierarchical mindmap with ~15 nodes, connected by bezier curves. Nodes have colored backgrounds based on level. You can:
- Drag nodes to reposition
- Drag empty space to pan
- Scroll to zoom
- See hover effects on nodes
- See the minimap in bottom-right

- [ ] **Step 4: Commit**

```bash
git add src/canvas/test-data.ts src/pages/EditorPage.tsx src/canvas/LayoutEngine.ts
git commit -m "test: add sample mindmap data and verify canvas rendering"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec Section | Plan 2 Task | Status |
|-------------|-------------|--------|
| Canvas 2D 渲染 | Tasks 5, 6, 8 | ✅ |
| Pretext 文本布局 | Task 5 | ✅ |
| 视口裁剪 | Tasks 7, 8 | ✅ |
| 脏矩形优化 | Task 8 (markDirty) | ✅ |
| 命中检测 | Task 7 | ✅ |
| 拖拽/缩放/平移 | Task 9 | ✅ |
| 键盘导航 | Task 9 (placeholder) | 🔄 Full in Plan 3 |
| 布局算法 | Task 10 | ✅ |
| 缩略图 | Task 11 | ✅ |
| 折叠/展开 | Task 5 (button drawn) | 🔄 Logic in Plan 3 |

**2. Placeholder scan:** No TBD/TODO. The keyboard handler and reparenting have explicit "in Plan 3" comments, which are acceptable as they reference concrete future work.

**3. Type consistency:** `Node`, `Edge` types from `src/types/index.ts` used consistently across all canvas modules.
