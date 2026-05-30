// ============================================================
//  Undo / Redo Store
// ============================================================
//  Command-pattern undo stack. Every mutating user action pushes
//  an UndoEntry before executing.  Undo restores the prior state;
//  redo re-applies the action.
//
//  Shortcuts (handled in InteractionManager):
//    Ctrl/Cmd + Z         → undo
//    Ctrl/Cmd + Shift + Z → redo
//
//  NOTE: All DB mutations in undo/redo are fire-and-forget from
//  the UI perspective – if a DB call fails we log it but the
//  in-memory store stays consistent so the user can keep working.
// ============================================================

import { createSignal } from 'solid-js';
import type { Node, Edge, CreateNodeInput, CreateEdgeInput } from '@/types';
import {
  mindmapState,
  addNode,
  removeNode,
  addEdge,
  removeEdge,
  updateNode,
} from './mindmapStore';
// LayoutEngine is used via registered callbacks, not directly here
import { clearSelection } from './canvasStore';

const MAX_HISTORY = 50;

/* ------------------------------------------------------------------ */
//  Undo entry types
/* ------------------------------------------------------------------ */

export type UndoEntry =
  | EditNodeEntry
  | CreateNodeEntry
  | DeleteSubtreeEntry
  | ToggleCollapseEntry
  | MoveNodeEntry
  | ReparentEntry
  | ReorderEntry;

interface EditNodeEntry {
  type: 'EDIT_NODE';
  nodeId: string;
  before: Partial<Node>;
  after: Partial<Node>;
}

interface CreateNodeEntry {
  type: 'CREATE_NODE';
  createdNode: Node; // snapshot with DB-assigned id
  createdEdge: Edge | null;
  nodeInput: CreateNodeInput; // for redo
  edgeInput: CreateEdgeInput | null; // for redo
}

interface DeleteSubtreeEntry {
  type: 'DELETE_SUBTREE';
  nodes: Node[]; // root first, then descendants
  edges: Edge[];
}

interface ToggleCollapseEntry {
  type: 'TOGGLE_COLLAPSE';
  nodeId: string;
  wasCollapsed: number;
}

interface MoveNodeEntry {
  type: 'MOVE_NODE';
  nodeId: string;
  from: { pos_x: number; pos_y: number };
  after?: { pos_x: number; pos_y: number };
}

interface ReparentEntry {
  type: 'REPARENT';
  nodeId: string;
  oldParentId: number | null;
  oldLevel: number;
  oldSortOrder: number;
  oldEdge: Edge | null;
  newEdge: Edge; // snapshot with DB-assigned id
}

interface ReorderEntry {
  type: 'REORDER';
  orders: { nodeId: string; before: number }[];
}

/* ------------------------------------------------------------------ */
//  Store state
/* ------------------------------------------------------------------ */

const [undoStack, setUndoStack] = createSignal<UndoEntry[]>([]);
const [redoStack, setRedoStack] = createSignal<UndoEntry[]>([]);

export const canUndo = () => undoStack().length > 0;
export const canRedo = () => redoStack().length > 0;

/* ------------------------------------------------------------------ */
//  Helpers
/* ------------------------------------------------------------------ */

function clearRedo(): void {
  setRedoStack([]);
}

function pushUndo(entry: UndoEntry): void {
  setUndoStack((prev) => {
    const next = [...prev, entry];
    if (next.length > MAX_HISTORY) next.shift();
    return next;
  });
  clearRedo();
}

function popUndo(): UndoEntry | undefined {
  const stack = undoStack();
  if (stack.length === 0) return undefined;
  const entry = stack[stack.length - 1];
  setUndoStack(stack.slice(0, -1));
  return entry;
}

function pushRedo(entry: UndoEntry): void {
  setRedoStack((prev) => {
    const next = [...prev, entry];
    if (next.length > MAX_HISTORY) next.shift();
    return next;
  });
}

function popRedo(): UndoEntry | undefined {
  const stack = redoStack();
  if (stack.length === 0) return undefined;
  const entry = stack[stack.length - 1];
  setRedoStack(stack.slice(0, -1));
  return entry;
}

/* ------------------------------------------------------------------ */
//  Public API: record actions
/* ------------------------------------------------------------------ */

export function recordEditNode(
  nodeId: string,
  before: Partial<Node>,
  after: Partial<Node>
): void {
  pushUndo({ type: 'EDIT_NODE', nodeId, before, after });
}

export function recordCreateNode(
  createdNode: Node,
  createdEdge: Edge | null,
  nodeInput: CreateNodeInput,
  edgeInput: CreateEdgeInput | null
): void {
  pushUndo({ type: 'CREATE_NODE', createdNode, createdEdge, nodeInput, edgeInput });
}

export function recordDeleteSubtree(nodes: Node[], edges: Edge[]): void {
  pushUndo({ type: 'DELETE_SUBTREE', nodes, edges });
}

export function recordToggleCollapse(nodeId: string, wasCollapsed: number): void {
  pushUndo({ type: 'TOGGLE_COLLAPSE', nodeId, wasCollapsed });
}

export function recordMoveNode(
  nodeId: string,
  from: { pos_x: number; pos_y: number },
  after?: { pos_x: number; pos_y: number }
): void {
  pushUndo({ type: 'MOVE_NODE', nodeId, from, after });
}

export function recordReparent(
  nodeId: string,
  oldParentId: number | null,
  oldLevel: number,
  oldSortOrder: number,
  oldEdge: Edge | null,
  newEdge: Edge
): void {
  pushUndo({ type: 'REPARENT', nodeId, oldParentId, oldLevel, oldSortOrder, oldEdge, newEdge });
}

export function recordReorder(
  orders: { nodeId: string; before: number }[]
): void {
  pushUndo({ type: 'REORDER', orders });
}

/* ------------------------------------------------------------------ */
//  Undo / Redo execution
/* ------------------------------------------------------------------ */

/**
 * Call this whenever a structural change (add/delete/reparent/reorder)
 * is completed so the canvas can re-layout.
 */
let layoutCallback: (() => void) | null = null;
let anchorLayoutCallback: ((nodeId: string) => void) | null = null;
let markDirtyCallback: (() => void) | null = null;
let invalidateNodeLayoutCallback: ((nodeId: string) => void) | null = null;
let stopAnimationCallback: (() => void) | null = null;

export function registerUndoCallbacks(params: {
  onLayout?: () => void;
  onAnchorLayout?: (nodeId: string) => void;
  onMarkDirty?: () => void;
  onInvalidateNodeLayout?: (nodeId: string) => void;
  onStopAnimation?: () => void;
}): void {
  layoutCallback = params.onLayout ?? null;
  anchorLayoutCallback = params.onAnchorLayout ?? null;
  markDirtyCallback = params.onMarkDirty ?? null;
  invalidateNodeLayoutCallback = params.onInvalidateNodeLayout ?? null;
  stopAnimationCallback = params.onStopAnimation ?? null;
}

function doLayout(): void {
  stopAnimationCallback?.();
  layoutCallback?.();
}

function doAnchorLayout(nodeId: string): void {
  stopAnimationCallback?.();
  anchorLayoutCallback?.(nodeId);
}

function doMarkDirty(): void {
  markDirtyCallback?.();
}

function doInvalidateNodeLayout(nodeId: string): void {
  invalidateNodeLayoutCallback?.(nodeId);
}

/* ------------------------------------------------------------------ */
//  Undo implementations
/* ------------------------------------------------------------------ */

async function undoEditNode(entry: EditNodeEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  const dbUpdates: Record<string, unknown> = { id: node.id };
  for (const [k, v] of Object.entries(entry.before)) {
    dbUpdates[k] = v;
  }

  try {
    await window.electronAPI.db.updateNode(dbUpdates as { id: number } & Record<string, unknown>);
  } catch (err) {
    console.error('[undo] failed to update node in DB:', err);
  }

  updateNode(entry.nodeId, entry.before);
  doInvalidateNodeLayout(entry.nodeId);
  doMarkDirty();
}

async function undoCreateNode(entry: CreateNodeEntry): Promise<void> {
  // Delete the created node (DB handles recursive delete)
  try {
    await window.electronAPI.db.deleteNode(entry.createdNode.id);
  } catch (err) {
    console.error('[undo] failed to delete node in DB:', err);
  }

  // Also delete any descendants that were created (DB already did this,
  // but we need to clean the store as well).
  const idsToDelete: string[] = [String(entry.createdNode.id)];
  const collect = (pid: string) => {
    for (const [id, n] of mindmapState.nodes) {
      if (n.parent_id !== null && String(n.parent_id) === pid) {
        idsToDelete.push(id);
        collect(id);
      }
    }
  };
  collect(String(entry.createdNode.id));
  const idSet = new Set(idsToDelete);

  for (const id of idsToDelete) {
    removeNode(id);
  }
  for (const [edgeId, edge] of mindmapState.edges) {
    if (idSet.has(String(edge.source_node_id)) || idSet.has(String(edge.target_node_id))) {
      removeEdge(edgeId);
    }
  }

  clearSelection();
  doLayout();
  doMarkDirty();
}

async function undoDeleteSubtree(entry: DeleteSubtreeEntry): Promise<void> {
  // Re-create all deleted nodes.  Since createNode returns a new id,
  // we maintain an old-id → new-id map so edges can be restored.
  const idMap = new Map<number, number>();

  for (const oldNode of entry.nodes) {
    const mappedParentId =
      oldNode.parent_id !== null
        ? (idMap.get(oldNode.parent_id) ?? oldNode.parent_id)
        : null;

    const input = {
      mindmap_id: oldNode.mindmap_id,
      parent_id: mappedParentId,
      node_type: oldNode.node_type,
      title: oldNode.title,
      content: oldNode.content,
      description: oldNode.description,
      style: JSON.parse(oldNode.style || '{}'),
      pos_x: oldNode.pos_x,
      pos_y: oldNode.pos_y,
      level: oldNode.level,
      sort_order: oldNode.sort_order,
      collapsed: oldNode.collapsed === 1,
    };

    try {
      const newNode = (await window.electronAPI.db.createNode(input)) as Node;
      idMap.set(oldNode.id, newNode.id);
      addNode(newNode);
    } catch (err) {
      console.error('[undo] failed to re-create node in DB:', err);
    }
  }

  for (const oldEdge of entry.edges) {
    const mappedSource = idMap.get(oldEdge.source_node_id) ?? oldEdge.source_node_id;
    const mappedTarget = idMap.get(oldEdge.target_node_id) ?? oldEdge.target_node_id;

    const input = {
      mindmap_id: oldEdge.mindmap_id,
      source_node_id: mappedSource,
      target_node_id: mappedTarget,
      edge_type: oldEdge.edge_type,
      style: JSON.parse(oldEdge.style || '{}'),
    };

    try {
      const newEdge = (await window.electronAPI.db.createEdge(input)) as Edge;
      addEdge(newEdge);
    } catch (err) {
      console.error('[undo] failed to re-create edge in DB:', err);
    }
  }

  doLayout();
  doMarkDirty();
}

async function undoToggleCollapse(entry: ToggleCollapseEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  try {
    await window.electronAPI.db.updateNode({
      id: node.id,
      collapsed: entry.wasCollapsed === 1,
    });
  } catch (err) {
    console.error('[undo] failed to update node in DB:', err);
  }

  updateNode(entry.nodeId, { collapsed: entry.wasCollapsed });
  doAnchorLayout(entry.nodeId);
  doMarkDirty();
}

async function undoMoveNode(entry: MoveNodeEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  try {
    await window.electronAPI.db.updateNode({
      id: node.id,
      pos_x: entry.from.pos_x,
      pos_y: entry.from.pos_y,
    });
  } catch (err) {
    console.error('[undo] failed to update node position in DB:', err);
  }

  updateNode(entry.nodeId, { pos_x: entry.from.pos_x, pos_y: entry.from.pos_y });
  doMarkDirty();
}

async function undoReparent(entry: ReparentEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  // 1. Delete the new edge & re-create the old edge
  try {
    await window.electronAPI.db.deleteEdge(entry.newEdge.id);
  } catch (err) {
    console.error('[undo] failed to delete new edge in DB:', err);
  }
  removeEdge(String(entry.newEdge.id));

  let restoredOldEdge: Edge | null = null;
  if (entry.oldEdge) {
    try {
      restoredOldEdge = (await window.electronAPI.db.createEdge({
        mindmap_id: entry.oldEdge.mindmap_id,
        source_node_id: entry.oldEdge.source_node_id,
        target_node_id: entry.oldEdge.target_node_id,
        edge_type: entry.oldEdge.edge_type,
        style: JSON.parse(entry.oldEdge.style || '{}'),
      })) as Edge;
      addEdge(restoredOldEdge);
    } catch (err) {
      console.error('[undo] failed to re-create old edge in DB:', err);
    }
  }

  // 2. Restore descendant levels
  const levelDelta = entry.oldLevel - node.level;
  const descendantIds: string[] = [];
  const collect = (pid: string) => {
    for (const [id, n] of mindmapState.nodes) {
      if (n.parent_id !== null && String(n.parent_id) === pid) {
        descendantIds.push(id);
        collect(id);
      }
    }
  };
  collect(entry.nodeId);

  for (const descId of descendantIds) {
    const desc = mindmapState.nodes.get(descId);
    if (!desc) continue;
    const restoredLevel = desc.level + levelDelta;
    try {
      await window.electronAPI.db.updateNode({ id: desc.id, level: restoredLevel });
    } catch (err) {
      console.error('[undo] failed to restore descendant level in DB:', err);
    }
    updateNode(descId, { level: restoredLevel });
  }

  // 3. Restore node parent/level/sort_order
  try {
    await window.electronAPI.db.updateNode({
      id: node.id,
      parent_id: entry.oldParentId,
      level: entry.oldLevel,
      sort_order: entry.oldSortOrder,
    });
  } catch (err) {
    console.error('[undo] failed to restore node parent in DB:', err);
  }

  updateNode(entry.nodeId, {
    parent_id: entry.oldParentId,
    level: entry.oldLevel,
    sort_order: entry.oldSortOrder,
  });

  doLayout();
  doMarkDirty();
}

async function undoReorder(entry: ReorderEntry): Promise<void> {
  for (const { nodeId, before } of entry.orders) {
    const node = mindmapState.nodes.get(nodeId);
    if (!node) continue;
    try {
      await window.electronAPI.db.updateNode({ id: node.id, sort_order: before });
    } catch (err) {
      console.error('[undo] failed to restore sort_order in DB:', err);
    }
    updateNode(nodeId, { sort_order: before });
  }
  doLayout();
  doMarkDirty();
}

/* ------------------------------------------------------------------ */
//  Redo implementations
/* ------------------------------------------------------------------ */

async function redoEditNode(entry: EditNodeEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  const dbUpdates: Record<string, unknown> = { id: node.id };
  for (const [k, v] of Object.entries(entry.after)) {
    dbUpdates[k] = v;
  }

  try {
    await window.electronAPI.db.updateNode(dbUpdates as { id: number } & Record<string, unknown>);
  } catch (err) {
    console.error('[redo] failed to update node in DB:', err);
  }

  updateNode(entry.nodeId, entry.after);
  doInvalidateNodeLayout(entry.nodeId);
  doMarkDirty();
}

async function redoCreateNode(entry: CreateNodeEntry): Promise<void> {
  try {
    const createdNode = (await window.electronAPI.db.createNode(entry.nodeInput)) as Node;
    addNode(createdNode);

    let createdEdge: Edge | null = null;
    if (entry.edgeInput) {
      const edgeInput = { ...entry.edgeInput, target_node_id: createdNode.id };
      createdEdge = (await window.electronAPI.db.createEdge(edgeInput)) as Edge;
      addEdge(createdEdge);
    }

    // Update the entry with new ids so subsequent undo/redo work
    entry.createdNode = createdNode;
    entry.createdEdge = createdEdge;
  } catch (err) {
    console.error('[redo] failed to create node in DB:', err);
  }

  doLayout();
  doMarkDirty();
}

async function redoDeleteSubtree(entry: DeleteSubtreeEntry): Promise<void> {
  // Delete every node we previously restored.  Use the *current* ids in the
  // store (which may differ from the original ids if the subtree was
  // restored via undo then re-deleted via redo).
  const idsToDelete = new Set<string>();
  for (const n of entry.nodes) {
    // Find the node in the store by matching title + parent + sort_order
    // (heuristic – in practice the root node of the subtree is unique enough)
    const match = findNodeInStore(n);
    if (match) {
      idsToDelete.add(String(match.id));
      collectDescendants(match.id, idsToDelete);
    }
  }

  for (const id of idsToDelete) {
    const node = mindmapState.nodes.get(id);
    if (node) {
      try {
        await window.electronAPI.db.deleteNode(node.id);
      } catch (err) {
        console.error('[redo] failed to delete node in DB:', err);
      }
      removeNode(id);
    }
  }

  for (const [edgeId, edge] of mindmapState.edges) {
    if (idsToDelete.has(String(edge.source_node_id)) || idsToDelete.has(String(edge.target_node_id))) {
      removeEdge(edgeId);
    }
  }

  clearSelection();
  doLayout();
  doMarkDirty();
}

function findNodeInStore(template: Node): Node | undefined {
  // Try exact match by title + parent + sort_order + content
  for (const [, n] of mindmapState.nodes) {
    if (
      n.title === template.title &&
      n.parent_id === template.parent_id &&
      n.sort_order === template.sort_order &&
      n.content === template.content &&
      n.level === template.level
    ) {
      return n;
    }
  }
  return undefined;
}

function collectDescendants(rootId: string | number, out: Set<string>): void {
  const strRootId = String(rootId);
  for (const [id, n] of mindmapState.nodes) {
    if (n.parent_id !== null && String(n.parent_id) === strRootId) {
      out.add(id);
      collectDescendants(id, out);
    }
  }
}

async function redoToggleCollapse(entry: ToggleCollapseEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  const nextCollapsed = entry.wasCollapsed === 0 ? 1 : 0;

  try {
    await window.electronAPI.db.updateNode({
      id: node.id,
      collapsed: nextCollapsed === 1,
    });
  } catch (err) {
    console.error('[redo] failed to update node in DB:', err);
  }

  updateNode(entry.nodeId, { collapsed: nextCollapsed });
  doAnchorLayout(entry.nodeId);
  doMarkDirty();
}

async function redoMoveNode(entry: MoveNodeEntry): Promise<void> {
  // We don't store the "to" position explicitly; in practice the user
  // dragged to a new place.  For redo we simply replay the same delta
  // if the node still exists.
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  const dx = (entry.after?.pos_x ?? node.pos_x) - entry.from.pos_x;
  const dy = (entry.after?.pos_y ?? node.pos_y) - entry.from.pos_y;
  const toX = node.pos_x + dx;
  const toY = node.pos_y + dy;

  try {
    await window.electronAPI.db.updateNode({ id: node.id, pos_x: toX, pos_y: toY });
  } catch (err) {
    console.error('[redo] failed to update node position in DB:', err);
  }

  updateNode(entry.nodeId, { pos_x: toX, pos_y: toY });
  doMarkDirty();
}

async function redoReparent(entry: ReparentEntry): Promise<void> {
  const node = mindmapState.nodes.get(entry.nodeId);
  if (!node) return;

  // Re-do the reparent using the *new* edge's target information.
  // Since the entry already stores the new edge, we can look up its
  // source (new parent) from that snapshot.
  const newParentId = entry.newEdge.source_node_id;
  const newParent = mindmapState.nodes.get(String(newParentId));
  if (!newParent) return;

  const newLevel = newParent.level + 1;
  const levelDelta = newLevel - node.level;

  // Find max sort_order among new siblings
  let newSortOrder = 0;
  for (const n of mindmapState.nodes.values()) {
    if (n.parent_id !== null && String(n.parent_id) === String(newParentId)) {
      newSortOrder = Math.max(newSortOrder, n.sort_order + 1);
    }
  }

  // Delete old edge
  let oldEdgeId: string | null = null;
  for (const [edgeId, edge] of mindmapState.edges) {
    if (
      String(edge.target_node_id) === entry.nodeId &&
      node.parent_id !== null &&
      String(edge.source_node_id) === String(node.parent_id)
    ) {
      oldEdgeId = edgeId;
      break;
    }
  }
  if (oldEdgeId) {
    const oldEdge = mindmapState.edges.get(oldEdgeId);
    if (oldEdge) {
      try {
        await window.electronAPI.db.deleteEdge(oldEdge.id);
      } catch (err) {
        console.error('[redo] failed to delete old edge in DB:', err);
      }
    }
    removeEdge(oldEdgeId);
  }

  // Create new edge
  let createdEdge: Edge;
  try {
    createdEdge = (await window.electronAPI.db.createEdge({
      mindmap_id: entry.newEdge.mindmap_id,
      source_node_id: newParentId,
      target_node_id: node.id,
      edge_type: 'parent_child',
    })) as Edge;
    addEdge(createdEdge);
  } catch (err) {
    console.error('[redo] failed to create edge in DB:', err);
    return;
  }

  // Update levels
  const descendantIds: string[] = [];
  const collect = (pid: string) => {
    for (const [id, n] of mindmapState.nodes) {
      if (n.parent_id !== null && String(n.parent_id) === pid) {
        descendantIds.push(id);
        collect(id);
      }
    }
  };
  collect(entry.nodeId);

  for (const descId of descendantIds) {
    const desc = mindmapState.nodes.get(descId);
    if (!desc) continue;
    const updatedLevel = desc.level + levelDelta;
    try {
      await window.electronAPI.db.updateNode({ id: desc.id, level: updatedLevel });
    } catch (err) {
      console.error('[redo] failed to update descendant level in DB:', err);
    }
    updateNode(descId, { level: updatedLevel });
  }

  // Update node
  try {
    await window.electronAPI.db.updateNode({
      id: node.id,
      parent_id: newParentId,
      level: newLevel,
      sort_order: newSortOrder,
    });
  } catch (err) {
    console.error('[redo] failed to update node in DB:', err);
  }

  updateNode(entry.nodeId, {
    parent_id: newParentId,
    level: newLevel,
    sort_order: newSortOrder,
  });

  // Update entry with the newly created edge so subsequent undo works
  entry.newEdge = createdEdge;

  doLayout();
  doMarkDirty();
}

async function redoReorder(entry: ReorderEntry): Promise<void> {
  // Re-apply the new ordering.  We derive the "after" values from the
  // current store (they were updated when the action originally ran).
  const afterOrders = new Map<string, number>();
  for (const { nodeId } of entry.orders) {
    const node = mindmapState.nodes.get(nodeId);
    if (node) afterOrders.set(nodeId, node.sort_order);
  }

  for (const { nodeId } of entry.orders) {
    // "after" is the order that was set during the original action.
    // For redo we re-apply that same order.
    const after = afterOrders.get(nodeId);
    if (after === undefined) continue;

    const node = mindmapState.nodes.get(nodeId);
    if (!node) continue;
    try {
      await window.electronAPI.db.updateNode({ id: node.id, sort_order: after });
    } catch (err) {
      console.error('[redo] failed to update sort_order in DB:', err);
    }
    updateNode(nodeId, { sort_order: after });
  }
  doLayout();
  doMarkDirty();
}

/* ------------------------------------------------------------------ */
//  Dispatch
/* ------------------------------------------------------------------ */

export async function undo(): Promise<void> {
  const entry = popUndo();
  if (!entry) return;

  switch (entry.type) {
    case 'EDIT_NODE':
      await undoEditNode(entry);
      break;
    case 'CREATE_NODE':
      await undoCreateNode(entry);
      break;
    case 'DELETE_SUBTREE':
      await undoDeleteSubtree(entry);
      break;
    case 'TOGGLE_COLLAPSE':
      await undoToggleCollapse(entry);
      break;
    case 'MOVE_NODE':
      await undoMoveNode(entry);
      break;
    case 'REPARENT':
      await undoReparent(entry);
      break;
    case 'REORDER':
      await undoReorder(entry);
      break;
  }

  pushRedo(entry);
}

export async function redo(): Promise<void> {
  const entry = popRedo();
  if (!entry) return;

  switch (entry.type) {
    case 'EDIT_NODE':
      await redoEditNode(entry);
      break;
    case 'CREATE_NODE':
      await redoCreateNode(entry);
      break;
    case 'DELETE_SUBTREE':
      await redoDeleteSubtree(entry);
      break;
    case 'TOGGLE_COLLAPSE':
      await redoToggleCollapse(entry);
      break;
    case 'MOVE_NODE':
      await redoMoveNode(entry);
      break;
    case 'REPARENT':
      await redoReparent(entry);
      break;
    case 'REORDER':
      await redoReorder(entry);
      break;
  }

  pushUndo(entry);
}

/* ------------------------------------------------------------------ */
//  Clear history (e.g. when switching mindmaps)
/* ------------------------------------------------------------------ */

export function clearUndoHistory(): void {
  setUndoStack([]);
  setRedoStack([]);
}
