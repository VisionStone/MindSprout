// ============================================================
// MindSprout — Minimap
// Small overview map with viewport overlay
// ============================================================

import { mindmapState } from '@/stores/mindmapStore';
import { canvasState } from '@/stores/canvasStore';
import { calculateNodeLayout } from './NodeRenderer';

/* -------------------------------------------------------------------------- */
//  Constants
/* -------------------------------------------------------------------------- */

const LEVEL_COLORS: Record<number, string> = {
  0: '#1976d2',
  1: '#388e3c',
  2: '#f57c00',
};
const DEFAULT_COLOR = '#9e9e9e';

/* -------------------------------------------------------------------------- */
//  Minimap
/* -------------------------------------------------------------------------- */

export class Minimap {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context for minimap');
    }
    this.ctx = ctx;
    this.resize();
  }

  /* ---------------------------------------------------------------------- */
  //  Resize
  /* ---------------------------------------------------------------------- */

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /* ---------------------------------------------------------------------- */
  //  Render
  /* ---------------------------------------------------------------------- */

  render(): void {
    const cssWidth = this.canvas.width / this.dpr;
    const cssHeight = this.canvas.height / this.dpr;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const nodes = mindmapState.nodes;
    if (nodes.size === 0) return;

    // Compute bounds of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [nodeId, node] of nodes) {
      const layout = calculateNodeLayout(node);
      minX = Math.min(minX, node.pos_x);
      minY = Math.min(minY, node.pos_y);
      maxX = Math.max(maxX, node.pos_x + layout.width);
      maxY = Math.max(maxY, node.pos_y + layout.height);
    }

    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return;

    // Scale to fit minimap canvas
    const scale = Math.min(cssWidth / contentW, cssHeight / contentH);
    const offsetX = (cssWidth - contentW * scale) / 2;
    const offsetY = (cssHeight - contentH * scale) / 2;

    // Helper to map world → minimap
    const mapX = (x: number) => offsetX + (x - minX) * scale;
    const mapY = (y: number) => offsetY + (y - minY) * scale;

    // Draw node rects
    for (const [nodeId, node] of nodes) {
      const layout = calculateNodeLayout(node);
      const x = mapX(node.pos_x);
      const y = mapY(node.pos_y);
      const w = Math.max(2, layout.width * scale);
      const h = Math.max(2, layout.height * scale);

      ctx.fillStyle = LEVEL_COLORS[node.level] ?? DEFAULT_COLOR;
      ctx.fillRect(x, y, w, h);
    }

    // Draw viewport overlay
    const { zoom, panX, panY } = canvasState;
    const vpLeft = -panX / zoom;
    const vpTop = -panY / zoom;
    const vpRight = (cssWidth - panX) / zoom;
    const vpBottom = (cssHeight - panY) / zoom;

    const miniVpX = mapX(vpLeft);
    const miniVpY = mapY(vpTop);
    const miniVpW = (vpRight - vpLeft) * scale;
    const miniVpH = (vpBottom - vpTop) * scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(miniVpX, miniVpY, miniVpW, miniVpH);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(miniVpX, miniVpY, miniVpW, miniVpH);
  }
}
