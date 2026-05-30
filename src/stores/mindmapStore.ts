import { createStore } from 'solid-js/store';
import type { Mindmap, Node, Edge } from '@/types';

/* -------------------------------------------------------------------------- */
//  Types
/* -------------------------------------------------------------------------- */

export interface MindmapState {
  mindmap: Mindmap | null;
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
}

/* -------------------------------------------------------------------------- */
//  Initial state
/* -------------------------------------------------------------------------- */

const [mindmapState, setState] = createStore<MindmapState>({
  mindmap: null,
  nodes: new Map(),
  edges: new Map(),
});

/* -------------------------------------------------------------------------- */
//  Actions
/* -------------------------------------------------------------------------- */

export function setMindmap(mindmap: Mindmap | null): void {
  setState('mindmap', mindmap);
}

export function setNodes(nodes: Map<string, Node>): void {
  setState('nodes', nodes);
}

export function setEdges(edges: Map<string, Edge>): void {
  setState('edges', edges);
}

export function addNode(node: Node): void {
  setState('nodes', (prev) => {
    const next = new Map(prev);
    next.set(String(node.id), node);
    return next;
  });
}

export function updateNode(nodeId: string, updates: Partial<Node>): void {
  setState('nodes', (prev) => {
    const next = new Map(prev);
    const existing = next.get(nodeId);
    if (existing) {
      next.set(nodeId, { ...existing, ...updates });
    }
    return next;
  });
}

export function removeNode(nodeId: string): void {
  setState('nodes', (prev) => {
    const next = new Map(prev);
    next.delete(nodeId);
    return next;
  });
}

export function addEdge(edge: Edge): void {
  setState('edges', (prev) => {
    const next = new Map(prev);
    next.set(String(edge.id), edge);
    return next;
  });
}

export function removeEdge(edgeId: string): void {
  setState('edges', (prev) => {
    const next = new Map(prev);
    next.delete(edgeId);
    return next;
  });
}

export function getChildren(nodeId: string): Node[] {
  const result: Node[] = [];
  for (const node of mindmapState.nodes.values()) {
    if (node.parent_id !== null && String(node.parent_id) === nodeId) {
      result.push(node);
    }
  }
  return result;
}

export function hasChildren(nodeId: string): boolean {
  for (const node of mindmapState.nodes.values()) {
    if (node.parent_id !== null && String(node.parent_id) === nodeId) {
      return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
//  Exports
/* -------------------------------------------------------------------------- */

export { mindmapState };
