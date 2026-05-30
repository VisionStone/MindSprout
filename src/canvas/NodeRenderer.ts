// ============================================================
// MindSprout — NodeRenderer
// Uses @chenglou/pretext for text measurement & line breaking
// ============================================================

import {
  prepareWithSegments,
  layoutWithLines,
  measureNaturalWidth,
  type PreparedTextWithSegments,
  type LayoutLine,
} from '@chenglou/pretext';
import type { Node } from '@/types';
import { layoutMarkdownDescription, drawMarkdownDescription, paginateMarkdownLayout, type MarkdownLayout } from './MarkdownRenderer';

/* -------------------------------------------------------------------------- */
//  Constants
/* -------------------------------------------------------------------------- */

export const HORIZONTAL_PADDING = 16;
export const VERTICAL_PADDING = 10;
export const MIN_NODE_WIDTH = 80;
export const MAX_NODE_WIDTH = 280;
export const EXPANDED_MAX_NODE_WIDTH = 680;
export const TITLE_FONT = '600 14px system-ui, -apple-system, sans-serif';
export const CONTENT_FONT = '400 12px system-ui, -apple-system, sans-serif';
export const DESCRIPTION_FONT = '400 13px system-ui, -apple-system, sans-serif';
export const TITLE_LINE_HEIGHT = 18;
export const CONTENT_LINE_HEIGHT = 16;
export const DESCRIPTION_LINE_HEIGHT = 20;
export const CORNER_RADIUS = 8;
export const GAP_TITLE_CONTENT = 4;
export const GAP_CONTENT_DESCRIPTION = 10;
export const MAX_DESCRIPTION_LINES = 40;
export const DESCRIPTION_PAGE_MAX_HEIGHT = 220;
export const PAGINATION_CONTROL_HEIGHT = 28;
export const SOURCE_ICON_RADIUS = 8;

const LEVEL_BG_COLORS: Record<number, string> = {
  0: '#e3f2fd',
  1: '#e8f5e9',
  2: '#fff3e0',
};
const LEVEL_BORDER_COLORS: Record<number, string> = {
  0: '#1976d2',
  1: '#388e3c',
  2: '#f57c00',
};
const DEFAULT_BG_COLOR = '#f5f5f5';
const DEFAULT_BORDER_COLOR = '#9e9e9e';

/* -------------------------------------------------------------------------- */
//  Prepare cache
/* -------------------------------------------------------------------------- */

const prepareCache = new Map<string, PreparedTextWithSegments>();

function getCachedPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = `${text}\0${font}`;
  let prepared = prepareCache.get(key);
  if (!prepared) {
    prepared = prepareWithSegments(text, font);
    prepareCache.set(key, prepared);
  }
  return prepared;
}

export function clearNodeRendererCache(): void {
  prepareCache.clear();
}

/* -------------------------------------------------------------------------- */
//  Layout type
/* -------------------------------------------------------------------------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeLayout {
  width: number;
  height: number;
  titleLines: LayoutLine[];
  contentLines: LayoutLine[];
  titleHeight: number;
  contentHeight: number;
  descriptionMarkdown?: MarkdownLayout;
  descriptionHeight?: number;
  descriptionPages?: MarkdownLayout[];
  descriptionPageCount?: number;
  descriptionCurrentPageHeight?: number;
  isExpanded?: boolean;
}

/* -------------------------------------------------------------------------- */
//  calculateNodeLayout
/* -------------------------------------------------------------------------- */

export function calculateNodeLayout(node: Node): NodeLayout {
  const textMaxWidth = MAX_NODE_WIDTH - HORIZONTAL_PADDING * 2;

  // Title
  const titlePrepared = getCachedPrepared(node.title || '', TITLE_FONT);
  const titleNaturalWidth = measureNaturalWidth(titlePrepared);
  const titleLayoutWidth = Math.min(titleNaturalWidth, textMaxWidth);
  const titleResult = layoutWithLines(titlePrepared, titleLayoutWidth, TITLE_LINE_HEIGHT);
  const titleHeight = titleResult.height;

  // Content
  const contentPrepared = getCachedPrepared(node.content || '', CONTENT_FONT);
  const contentNaturalWidth = measureNaturalWidth(contentPrepared);
  const contentLayoutWidth = Math.min(contentNaturalWidth, textMaxWidth);
  const contentResult = layoutWithLines(contentPrepared, contentLayoutWidth, CONTENT_LINE_HEIGHT);
  const contentHeight = node.content ? contentResult.height : 0;

  const maxLineWidth = Math.max(
    titleResult.lines.length > 0
      ? Math.max(...titleResult.lines.map((l) => l.width))
      : 0,
    contentResult.lines.length > 0 && node.content
      ? Math.max(...contentResult.lines.map((l) => l.width))
      : 0
  );

  const width = Math.max(maxLineWidth + HORIZONTAL_PADDING * 2, MIN_NODE_WIDTH);
  const height =
    VERTICAL_PADDING +
    titleHeight +
    (node.content ? GAP_TITLE_CONTENT + contentHeight : 0) +
    VERTICAL_PADDING;

  return {
    width,
    height,
    titleLines: titleResult.lines,
    contentLines: contentResult.lines,
    titleHeight,
    contentHeight,
  };
}

export function calculateExpandedNodeLayout(node: Node, pageIndex: number = 0): NodeLayout {
  // If the node has no description, the expanded layout is identical to the
  // normal layout. This prevents unnecessary size changes when a node without
  // a description is "expanded" purely for viewport-centering purposes.
  if (!node.description) {
    return calculateNodeLayout(node);
  }

  const textMaxWidth = EXPANDED_MAX_NODE_WIDTH - HORIZONTAL_PADDING * 2;

  // Title (same as normal)
  const titlePrepared = getCachedPrepared(node.title || '', TITLE_FONT);
  const titleNaturalWidth = measureNaturalWidth(titlePrepared);
  const titleLayoutWidth = Math.min(titleNaturalWidth, textMaxWidth);
  const titleResult = layoutWithLines(titlePrepared, titleLayoutWidth, TITLE_LINE_HEIGHT);
  const titleHeight = titleResult.height;

  // Content (same as normal)
  const contentPrepared = getCachedPrepared(node.content || '', CONTENT_FONT);
  const contentNaturalWidth = measureNaturalWidth(contentPrepared);
  const contentLayoutWidth = Math.min(contentNaturalWidth, textMaxWidth);
  const contentResult = layoutWithLines(contentPrepared, contentLayoutWidth, CONTENT_LINE_HEIGHT);
  const contentHeight = node.content ? contentResult.height : 0;

  // Description (Markdown) — paginated
  let descriptionMarkdown: MarkdownLayout | undefined;
  let descriptionPages: MarkdownLayout[] | undefined;
  let descriptionPageCount = 0;
  let descriptionCurrentPageHeight = 0;
  let descriptionHeight = 0;

  if (node.description) {
    descriptionMarkdown = layoutMarkdownDescription(node.description, textMaxWidth);
    descriptionPages = paginateMarkdownLayout(descriptionMarkdown, DESCRIPTION_PAGE_MAX_HEIGHT);
    descriptionPageCount = descriptionPages.length;
    const currentPage = descriptionPages[Math.min(pageIndex, Math.max(0, descriptionPages.length - 1))];
    descriptionCurrentPageHeight = currentPage ? currentPage.totalHeight : 0;
    descriptionHeight = descriptionPages.length > 0
      ? Math.max(...descriptionPages.map(p => p.totalHeight))
      : 0;
    if (descriptionPageCount > 1) {
      descriptionHeight += PAGINATION_CONTROL_HEIGHT;
    }
  }

  const width = EXPANDED_MAX_NODE_WIDTH;
  const height =
    VERTICAL_PADDING +
    titleHeight +
    (node.content ? GAP_TITLE_CONTENT + contentHeight : 0) +
    (node.description ? GAP_CONTENT_DESCRIPTION + descriptionHeight : 0) +
    VERTICAL_PADDING;

  return {
    width,
    height,
    titleLines: titleResult.lines,
    contentLines: contentResult.lines,
    titleHeight,
    contentHeight,
    descriptionMarkdown,
    descriptionHeight,
    descriptionPages,
    descriptionPageCount,
    descriptionCurrentPageHeight,
    isExpanded: true,
  };
}

/* -------------------------------------------------------------------------- */
//  roundRect helper
/* -------------------------------------------------------------------------- */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
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

/* -------------------------------------------------------------------------- */
//  drawNode
/* -------------------------------------------------------------------------- */

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: Node,
  layout: NodeLayout,
  isSelected: boolean,
  isHovered: boolean,
  hasChildNodes: boolean,
  isDropTarget: boolean = false,
  currentPageIndex: number = 0
): void {
  const x = node.pos_x;
  const y = node.pos_y;
  const w = layout.width;
  const h = layout.height;

  const bgColor = LEVEL_BG_COLORS[node.level] ?? DEFAULT_BG_COLOR;
  const borderColor = LEVEL_BORDER_COLORS[node.level] ?? DEFAULT_BORDER_COLOR;

  if (isDropTarget) {
    ctx.save();
    ctx.shadowColor = 'rgba(25, 118, 210, 0.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(25, 118, 210, 0.08)';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, CORNER_RADIUS + 4);
    ctx.fill();
    ctx.strokeStyle = '#1976d2';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 3]);
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, CORNER_RADIUS + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = isSelected ? 'rgba(25, 118, 210, 0.35)' : 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = isSelected ? 12 : 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = isSelected ? 4 : 2;

  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, CORNER_RADIUS);
  ctx.fill();

  ctx.restore();

  ctx.strokeStyle = isSelected ? '#1976d2' : isHovered ? '#64b5f6' : borderColor;
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  roundRect(ctx, x, y, w, h, CORNER_RADIUS);
  ctx.stroke();

  // Title text
  ctx.fillStyle = '#1a1a1a';
  ctx.font = TITLE_FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  let currentY = y + VERTICAL_PADDING;
  for (const line of layout.titleLines) {
    ctx.fillText(line.text, x + HORIZONTAL_PADDING, currentY);
    currentY += TITLE_LINE_HEIGHT;
  }

  // Content text
  if (layout.contentLines.length > 0 && node.content) {
    currentY += GAP_TITLE_CONTENT;
    ctx.fillStyle = '#555555';
    ctx.font = CONTENT_FONT;
    for (const line of layout.contentLines) {
      ctx.fillText(line.text, x + HORIZONTAL_PADDING, currentY);
      currentY += CONTENT_LINE_HEIGHT;
    }
  }

  // Description (Markdown, paginated, only when expanded / selected)
  if (layout.isExpanded && layout.descriptionPages && layout.descriptionPages.length > 0 && node.description) {
    currentY += GAP_CONTENT_DESCRIPTION;

    // Pagination controls FIRST (at the top of description area)
    if (layout.descriptionPageCount && layout.descriptionPageCount > 1) {
      const ctrlY = currentY;
      const ctrlH = PAGINATION_CONTROL_HEIGHT - 4;
      const ctrlW = w - HORIZONTAL_PADDING * 2;
      const btnW = 28;
      const btnH = ctrlH;

      // Background bar
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      roundRect(ctx, x + HORIZONTAL_PADDING, ctrlY, ctrlW, ctrlH, 4);
      ctx.fill();
      ctx.restore();

      const isFirstPage = currentPageIndex === 0;
      const isLastPage = currentPageIndex >= (layout.descriptionPageCount - 1);

      // Prev button
      const prevX = x + HORIZONTAL_PADDING + 4;
      const prevY = ctrlY + (ctrlH - btnH) / 2;
      ctx.save();
      ctx.fillStyle = isFirstPage ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)';
      roundRect(ctx, prevX, prevY, btnW, btnH, 4);
      ctx.fill();
      ctx.fillStyle = isFirstPage ? '#999999' : '#555555';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◀', prevX + btnW / 2, prevY + btnH / 2 + 1);
      ctx.restore();

      // Page indicator
      ctx.save();
      ctx.fillStyle = '#666666';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${currentPageIndex + 1} / ${layout.descriptionPageCount}`,
        x + w / 2,
        ctrlY + ctrlH / 2 + 1
      );
      ctx.restore();

      // Next button
      const nextX = x + w - HORIZONTAL_PADDING - 4 - btnW;
      const nextY = ctrlY + (ctrlH - btnH) / 2;
      ctx.save();
      ctx.fillStyle = isLastPage ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)';
      roundRect(ctx, nextX, nextY, btnW, btnH, 4);
      ctx.fill();
      ctx.fillStyle = isLastPage ? '#999999' : '#555555';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶', nextX + btnW / 2, nextY + btnH / 2 + 1);
      ctx.restore();

      currentY += ctrlH;
      currentY += 10;
    }

    const page = layout.descriptionPages[Math.min(currentPageIndex, layout.descriptionPages.length - 1)];
    if (page) {
      drawMarkdownDescription(ctx, page, x + HORIZONTAL_PADDING, currentY, layout.width);
      currentY += page.totalHeight;
    }
  }

  // Collapse / expand button (right edge)
  if (hasChildNodes) {
    const btnR = 7;
    const btnCX = x + w;
    const btnCY = y + h / 2;

    // Button background (white circle with border)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(btnCX, btnCY, btnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Plus or minus icon
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (node.collapsed) {
      // Plus
      ctx.moveTo(btnCX - 3, btnCY);
      ctx.lineTo(btnCX + 3, btnCY);
      ctx.moveTo(btnCX, btnCY - 3);
      ctx.lineTo(btnCX, btnCY + 3);
    } else {
      // Minus
      ctx.moveTo(btnCX - 3, btnCY);
      ctx.lineTo(btnCX + 3, btnCY);
    }
    ctx.stroke();
  }

  // Source link icon (bottom-right, outside node)
  if (node.source_doc) {
    const iconCX = x + w - 2;
    const iconCY = y + h + SOURCE_ICON_RADIUS + 2;
    const iconColor = borderColor;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = iconColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, SOURCE_ICON_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = iconColor;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(iconCX - 1.5, iconCY - 3.5);
    ctx.bezierCurveTo(iconCX - 4.5, iconCY - 3.5, iconCX - 4.5, iconCY + 3.5, iconCX - 1.5, iconCY + 3.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(iconCX + 1.5, iconCY + 3.5);
    ctx.bezierCurveTo(iconCX + 4.5, iconCY + 3.5, iconCX + 4.5, iconCY - 3.5, iconCX + 1.5, iconCY - 3.5);
    ctx.stroke();

    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */
//  getPaginationControlBounds
//  Returns hit-test rectangles for pagination buttons in world coordinates.
//  Returns null when the node has no multi-page description.
/* -------------------------------------------------------------------------- */

export function getPaginationControlBounds(
  node: Node,
  layout: NodeLayout,
  currentPageIndex: number = 0
): { prevBtn: Rect; nextBtn: Rect } | null {
  if (!layout.isExpanded || !layout.descriptionPages || layout.descriptionPages.length <= 1) {
    return null;
  }

  const x = node.pos_x;
  const y = node.pos_y;
  const w = layout.width;

  // Controls are at the top of description area
  let currentY = y + VERTICAL_PADDING + layout.titleHeight;
  if (layout.contentLines.length > 0 && node.content) {
    currentY += GAP_TITLE_CONTENT + layout.contentHeight;
  }
  currentY += GAP_CONTENT_DESCRIPTION;

  const ctrlY = currentY;
  const ctrlH = PAGINATION_CONTROL_HEIGHT - 4;
  const btnW = 28;
  const btnH = ctrlH;

  const prevX = x + HORIZONTAL_PADDING + 4;
  const prevY = ctrlY + (ctrlH - btnH) / 2;

  const nextX = x + w - HORIZONTAL_PADDING - 4 - btnW;
  const nextY = ctrlY + (ctrlH - btnH) / 2;

  return {
    prevBtn: { x: prevX, y: prevY, width: btnW, height: btnH },
    nextBtn: { x: nextX, y: nextY, width: btnW, height: btnH },
  };
}

/* -------------------------------------------------------------------------- */
//  getSourceIconBounds
//  Returns hit-test rectangle for the source link icon in world coordinates.
//  Returns null when the node has no source_doc.
/* -------------------------------------------------------------------------- */

export function getSourceIconBounds(
  node: Node,
  layout: NodeLayout
): Rect | null {
  if (!node.source_doc) return null;

  const x = node.pos_x;
  const y = node.pos_y;
  const w = layout.width;
  const h = layout.height;

  const iconCX = x + w - 2;
  const iconCY = y + h + SOURCE_ICON_RADIUS + 2;

  return {
    x: iconCX - SOURCE_ICON_RADIUS,
    y: iconCY - SOURCE_ICON_RADIUS,
    width: SOURCE_ICON_RADIUS * 2,
    height: SOURCE_ICON_RADIUS * 2,
  };
}
