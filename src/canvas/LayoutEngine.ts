// ============================================================
// MindSprout — LayoutEngine
// Custom hierarchical tree layout
// Computes X from dagre ranks, Y from recursive subtree heights
// ============================================================

import * as dagre from 'dagre';
import type { Node, Edge } from '@/types';
import { calculateNodeLayout, calculateExpandedNodeLayout } from './NodeRenderer';

/* -------------------------------------------------------------------------- */
//  applyHierarchicalLayout
/* -------------------------------------------------------------------------- */

export function applyHierarchicalLayout(
  nodes: Map<string, Node>,
  edges: Map<string, Edge>,
  expandedNodeId?: string
): Map<string, Node> {
  // Step 1: Build tree structure
  const rootId = findRootId(nodes);
  if (!rootId) return new Map(nodes);

  // Step 2: Compute layout for each node (width/height)
  const layouts = new Map<string, ReturnType<typeof calculateNodeLayout>>();
  for (const [nodeId, node] of nodes) {
    if (nodeId === expandedNodeId) {
      layouts.set(nodeId, calculateExpandedNodeLayout(node));
    } else {
      layouts.set(nodeId, calculateNodeLayout(node));
    }
  }

  // Step 3: Use dagre only to determine X positions (layer ranks)
  const rankByNodeId = computeDagreRanks(nodes, edges, layouts);

  // Step 4: Compute X positions from dagre ranks
  const xPositions = computeXPositions(rankByNodeId, layouts);

  // Step 5: Recursively compute Y positions from subtree heights
  const yPositions = new Map<string, number>();
  computeYPositionsRecursive(rootId, nodes, layouts, yPositions, 0);

  // Step 6: Apply positions
  const result = new Map(nodes);
  for (const [nodeId, node] of nodes) {
    const x = xPositions.get(nodeId);
    const y = yPositions.get(nodeId);
    if (x !== undefined && y !== undefined) {
      result.set(nodeId, {
        ...node,
        pos_x: x,
        pos_y: y,
      });
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
//  applyLayoutWithAnchor
//  Runs hierarchical layout, then translates all nodes so that the anchor
//  node stays at its original screen position. This prevents jarring jumps
//  when the user folds/unfolds a subtree.
/* -------------------------------------------------------------------------- */

export function applyLayoutWithAnchor(
  nodes: Map<string, Node>,
  edges: Map<string, Edge>,
  anchorNodeId: string,
  expandedNodeId?: string
): Map<string, Node> {
  const anchorNode = nodes.get(anchorNodeId);
  if (!anchorNode) {
    return applyHierarchicalLayout(nodes, edges, expandedNodeId);
  }

  const anchorX = anchorNode.pos_x;
  const anchorY = anchorNode.pos_y;

  const laidOutNodes = applyHierarchicalLayout(nodes, edges, expandedNodeId);

  const newAnchor = laidOutNodes.get(anchorNodeId);
  if (!newAnchor) {
    return laidOutNodes;
  }

  const deltaX = anchorX - newAnchor.pos_x;
  const deltaY = anchorY - newAnchor.pos_y;

  // If the anchor didn't move, nothing to do.
  if (deltaX === 0 && deltaY === 0) {
    return laidOutNodes;
  }

  const result = new Map(laidOutNodes);
  for (const [id, node] of result) {
    result.set(id, {
      ...node,
      pos_x: node.pos_x + deltaX,
      pos_y: node.pos_y + deltaY,
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
//  Step 1: Use dagre to compute rank (layer) for each node
/* -------------------------------------------------------------------------- */

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

function computeDagreRanks(
  nodes: Map<string, Node>,
  edges: Map<string, Edge>,
  layouts: Map<string, ReturnType<typeof calculateNodeLayout>>
): Map<string, number> {
  // Only include visible nodes (exclude descendants of collapsed nodes)
  const visibleNodeIds = new Set<string>();
  for (const [nodeId] of nodes) {
    if (isNodeVisible(nodeId, nodes)) {
      visibleNodeIds.add(nodeId);
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [nodeId, node] of nodes) {
    if (!visibleNodeIds.has(nodeId)) continue;
    const layout = layouts.get(nodeId);
    if (!layout) continue;
    g.setNode(nodeId, { width: layout.width, height: layout.height });
  }

  for (const edge of edges.values()) {
    const sourceId = String(edge.source_node_id);
    const targetId = String(edge.target_node_id);
    if (visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)) {
      g.setEdge(sourceId, targetId);
    }
  }

  dagre.layout(g);

  const ranks = new Map<string, number>();
  for (const nodeId of visibleNodeIds) {
    const graphNode = g.node(nodeId) as dagre.Node | undefined;
    if (graphNode) {
      ranks.set(nodeId, graphNode.x ?? 0);
    }
  }

  return ranks;
}

/* -------------------------------------------------------------------------- */
//  Step 2: Find root node
/* -------------------------------------------------------------------------- */

function findRootId(nodes: Map<string, Node>): string | null {
  for (const [nodeId, node] of nodes) {
    if (node.node_type === 'root' || node.parent_id === null) {
      return nodeId;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
//  Step 4: Compute X positions from dagre ranks
//  Normalize so leftmost rank starts at 0
/* -------------------------------------------------------------------------- */

function computeXPositions(
  rankByNodeId: Map<string, number>,
  layouts: Map<string, ReturnType<typeof calculateNodeLayout>>
): Map<string, number> {
  // Group nodes by rank value
  const nodesByRank = new Map<number, string[]>();
  let minRank = Infinity;
  let maxRank = -Infinity;

  for (const [nodeId, rank] of rankByNodeId) {
    if (!nodesByRank.has(rank)) {
      nodesByRank.set(rank, []);
    }
    nodesByRank.get(rank)!.push(nodeId);
    minRank = Math.min(minRank, rank);
    maxRank = Math.max(maxRank, rank);
  }

  // Sort ranks and compute cumulative X positions
  const sortedRanks = Array.from(nodesByRank.keys()).sort((a, b) => a - b);
  const xPositions = new Map<string, number>();
  let currentX = 0;

  for (let i = 0; i < sortedRanks.length; i++) {
    const rank = sortedRanks[i];
    const nodeIds = nodesByRank.get(rank)!;

    // Find max width in this rank
    let maxWidth = 0;
    for (const nodeId of nodeIds) {
      const layout = layouts.get(nodeId);
      if (layout) {
        maxWidth = Math.max(maxWidth, layout.width);
      }
    }

    // Place all nodes in this rank at the same X
    for (const nodeId of nodeIds) {
      xPositions.set(nodeId, currentX);
    }

    // Advance X for next rank
    currentX += maxWidth + 80; // ranksep
  }

  return xPositions;
}

/* -------------------------------------------------------------------------- */
//  Step 5: Recursively compute Y positions
//  Each parent's Y is centered over its children
//  Children are stacked vertically with gaps
/* -------------------------------------------------------------------------- */

function computeYPositionsRecursive(
  nodeId: string,
  nodes: Map<string, Node>,
  layouts: Map<string, ReturnType<typeof calculateNodeLayout>>,
  yPositions: Map<string, number>,
  startY: number
): number {
  const node = nodes.get(nodeId);
  const layout = layouts.get(nodeId);
  if (!node || !layout) return startY;

  // If collapsed, do not layout children — subtree occupies only this node
  if (node.collapsed) {
    yPositions.set(nodeId, startY);
    return startY + layout.height;
  }

  // Get children sorted by sort_order
  const children: string[] = [];
  for (const [id, n] of nodes) {
    if (n.parent_id !== null && String(n.parent_id) === nodeId) {
      children.push(id);
    }
  }
  children.sort((a, b) => {
    const na = nodes.get(a);
    const nb = nodes.get(b);
    return (na?.sort_order ?? 0) - (nb?.sort_order ?? 0);
  });

  if (children.length === 0) {
    // Leaf node: place at startY
    yPositions.set(nodeId, startY);
    return startY + layout.height;
  }

  // Compute children's Y positions first
  const NODE_GAP = 40;
  let childCurrentY = startY;
  const childSubtreeHeights: number[] = [];

  for (const childId of children) {
    const childEndY = computeYPositionsRecursive(
      childId,
      nodes,
      layouts,
      yPositions,
      childCurrentY
    );
    const subtreeHeight = childEndY - childCurrentY;
    childSubtreeHeights.push(subtreeHeight);
    childCurrentY = childEndY + NODE_GAP;
  }

  // Total height of children subtree
  const totalChildrenHeight = childCurrentY - startY - NODE_GAP;

  // Center parent vertically over its children
  const parentY = startY + (totalChildrenHeight - layout.height) / 2;
  yPositions.set(nodeId, Math.max(startY, parentY));

  // Return the total height occupied by this subtree
  return Math.max(childCurrentY - NODE_GAP, startY + layout.height);
}
