// ============================================================
// MindSprout — HitTester
// Coordinate conversion, hit testing, and viewport culling
// ============================================================

import type { Node } from '@/types';
import type { NodeLayout } from './NodeRenderer';

/* -------------------------------------------------------------------------- */
//  Coordinate conversion
/* -------------------------------------------------------------------------- */

export function screenToWorld(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: worldX * zoom + panX,
    y: worldY * zoom + panY,
  };
}

/* -------------------------------------------------------------------------- */
//  hitTest
/* -------------------------------------------------------------------------- */

export function hitTest(
  screenX: number,
  screenY: number,
  nodes: Map<string, Node>,
  nodeLayouts: Map<string, NodeLayout>,
  panX: number,
  panY: number,
  zoom: number
): string | null {
  const worldPos = screenToWorld(screenX, screenY, panX, panY, zoom);

  // Reverse iteration so top-most (last drawn) node wins
  const entries = Array.from(nodes.entries());
  for (let i = entries.length - 1; i >= 0; i--) {
    const [nodeId, node] = entries[i];
    const layout = nodeLayouts.get(nodeId);
    if (!layout) continue;

    if (
      worldPos.x >= node.pos_x &&
      worldPos.x <= node.pos_x + layout.width &&
      worldPos.y >= node.pos_y &&
      worldPos.y <= node.pos_y + layout.height
    ) {
      return nodeId;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
//  getVisibleNodes
/* -------------------------------------------------------------------------- */

export function getVisibleNodes(
  nodes: Map<string, Node>,
  nodeLayouts: Map<string, NodeLayout>,
  panX: number,
  panY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  padding = 100
): string[] {
  const left = (-panX - padding) / zoom;
  const top = (-panY - padding) / zoom;
  const right = (canvasWidth + padding - panX) / zoom;
  const bottom = (canvasHeight + padding - panY) / zoom;

  const visible: string[] = [];
  for (const [nodeId, node] of nodes) {
    const layout = nodeLayouts.get(nodeId);
    if (!layout) continue;

    const nodeLeft = node.pos_x;
    const nodeTop = node.pos_y;
    const nodeRight = node.pos_x + layout.width;
    const nodeBottom = node.pos_y + layout.height;

    if (nodeRight >= left && nodeLeft <= right && nodeBottom >= top && nodeTop <= bottom) {
      visible.push(nodeId);
    }
  }
  return visible;
}
