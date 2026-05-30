// ============================================================
// MindSprout — EdgeRenderer
// Draws cubic-bezier edges between parent and child nodes
// ============================================================

import type { Edge, Node } from '@/types';
import type { NodeLayout } from './NodeRenderer';

/* -------------------------------------------------------------------------- */
//  Helpers
/* -------------------------------------------------------------------------- */

function parseEdgeStyle(styleStr: string): { color?: string; width?: number; dash?: boolean } {
  try {
    return JSON.parse(styleStr) as { color?: string; width?: number; dash?: boolean };
  } catch {
    return {};
  }
}

/* -------------------------------------------------------------------------- */
//  drawEdge
/* -------------------------------------------------------------------------- */

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: Edge,
  sourceNode: Node,
  targetNode: Node,
  sourceLayout: NodeLayout,
  targetLayout: NodeLayout
): void {
  const startX = sourceNode.pos_x + sourceLayout.width;
  const startY = sourceNode.pos_y + sourceLayout.height / 2;
  const endX = targetNode.pos_x;
  const endY = targetNode.pos_y + targetLayout.height / 2;

  const dx = endX - startX;
  const cp1x = startX + dx * 0.5;
  const cp1y = startY;
  const cp2x = endX - dx * 0.5;
  const cp2y = endY;

  const style = parseEdgeStyle(edge.style);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
  ctx.strokeStyle = style.color ?? '#b0b0b0';
  ctx.lineWidth = style.width ?? 1.5;
  ctx.setLineDash(style.dash ? [4, 4] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
