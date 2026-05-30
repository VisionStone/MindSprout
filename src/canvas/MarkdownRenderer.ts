// ============================================================
//  MarkdownRenderer
//  Parse node.description (Markdown) and layout for Canvas.
//  Supports: paragraphs, headings, lists, blockquotes,
//  bold, italic, inline code.
// ============================================================

import { lexer, type Token } from 'marked';

/* ------------------------------------------------------------------ */
//  Constants
/* ------------------------------------------------------------------ */

const DESC_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const DESC_CODE_FAMILY = '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", monospace';

const NORMAL_FONT = `400 13px ${DESC_FONT_FAMILY}`;
const BOLD_FONT = `600 13px ${DESC_FONT_FAMILY}`;
const ITALIC_FONT = `italic 400 13px ${DESC_FONT_FAMILY}`;
const BOLD_ITALIC_FONT = `italic 600 13px ${DESC_FONT_FAMILY}`;
const CODE_FONT = `400 12px ${DESC_CODE_FAMILY}`;

const H1_FONT = `700 18px ${DESC_FONT_FAMILY}`;
const H2_FONT = `700 16px ${DESC_FONT_FAMILY}`;
const H3_FONT = `600 14px ${DESC_FONT_FAMILY}`;

const NORMAL_COLOR = '#444444';
const HEADING_COLOR = '#1a1a1a';
const CODE_COLOR = '#c62828';
const CODE_BG = 'rgba(0, 0, 0, 0.06)';
// const BLOCKQUOTE_COLOR = '#555555'; // reserved for future inline quote styling
const BLOCKQUOTE_BORDER = '#bdbdbd';
const LIST_BULLET_COLOR = '#666666';

const NORMAL_LINE_HEIGHT = 20;
const HEADING_LINE_HEIGHT = 26;
const CODE_LINE_HEIGHT = 18;

// No max line limit – the card simply grows taller as needed

/* ------------------------------------------------------------------ */
//  Types
/* ------------------------------------------------------------------ */

export interface MarkdownSpan {
  text: string;
  font: string;
  color: string;
  isCode?: boolean;
}

export interface MarkdownLine {
  spans: MarkdownSpan[];
  indent: number; // px
  height: number; // px
  hasCodeBg?: boolean;
}

export interface MarkdownBlock {
  lines: MarkdownLine[];
  marginTop: number;
  marginBottom: number;
  isBlockquote?: boolean;
  blockquoteBarWidth?: number;
}

export interface MarkdownLayout {
  blocks: MarkdownBlock[];
  totalHeight: number;
  lineCount: number;
}

/* ------------------------------------------------------------------ */
//  Text measurement (shared off-screen context)
/* ------------------------------------------------------------------ */

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) {
    const canvas = document.createElement('canvas');
    _measureCtx = canvas.getContext('2d')!;
  }
  return _measureCtx;
}

function measureWidth(text: string, font: string): number {
  const ctx = getMeasureCtx();
  ctx.font = font;
  return ctx.measureText(text).width;
}

/* ------------------------------------------------------------------ */
//  Inline token → spans
/* ------------------------------------------------------------------ */

function processInlineTokens(
  tokens: Token[],
  baseFont: string,
  baseColor: string
): MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        // If the text token has inline children (strong, em, etc.),
        // recurse into them instead of using the raw text string.
        const childTokens = (token as Token & { tokens?: Token[] }).tokens;
        if (childTokens && childTokens.length > 0) {
          spans.push(...processInlineTokens(childTokens, baseFont, baseColor));
        } else {
          const text = token.text || token.raw || '';
          if (text) {
            spans.push({ text, font: baseFont, color: baseColor });
          }
        }
        break;
      }
      case 'strong': {
        const inner = processInlineTokens(
          token.tokens || [],
          baseFont.includes('italic') ? BOLD_ITALIC_FONT : BOLD_FONT,
          baseColor
        );
        spans.push(...inner);
        break;
      }
      case 'em': {
        const inner = processInlineTokens(
          token.tokens || [],
          baseFont.includes('600') ? BOLD_ITALIC_FONT : ITALIC_FONT,
          baseColor
        );
        spans.push(...inner);
        break;
      }
      case 'codespan': {
        const text = token.text || token.raw?.replace(/^`|`$/g, '') || '';
        if (text) {
          spans.push({ text, font: CODE_FONT, color: CODE_COLOR, isCode: true });
        }
        break;
      }
      case 'del': {
        const inner = processInlineTokens(token.tokens || [], baseFont, baseColor);
        for (const s of inner) {
          spans.push({ ...s, color: '#999999' });
        }
        break;
      }
      case 'link': {
        const inner = processInlineTokens(token.tokens || [], baseFont, '#1976d2');
        spans.push(...inner);
        break;
      }
      case 'br': {
        spans.push({ text: '\n', font: baseFont, color: baseColor });
        break;
      }
      default:
        break;
    }
  }

  return spans;
}

/* ------------------------------------------------------------------ */
//  Wrap spans into lines
/* ------------------------------------------------------------------ */

function wrapSpans(
  spans: MarkdownSpan[],
  maxWidth: number,
  baseIndent: number,
  lineHeight: number
): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let currentSpans: MarkdownSpan[] = [];
  let currentWidth = baseIndent;

  function pushLine(): void {
    if (currentSpans.length > 0) {
      lines.push({
        spans: currentSpans,
        indent: baseIndent,
        height: lineHeight,
        // hasCodeBg is only set for code blocks (```), not inline codespan
        hasCodeBg: false,
      });
      currentSpans = [];
      currentWidth = baseIndent;
    }
  }

  for (const span of spans) {
    const spanWidth = measureWidth(span.text, span.font);

    if (currentWidth + spanWidth <= maxWidth) {
      currentSpans.push(span);
      currentWidth += spanWidth;
      continue;
    }

    // Need to break this span across lines
    if (spanWidth > maxWidth - baseIndent && span.text.length > 1) {
      // Span itself is too wide – break it by characters
      let remaining = span.text;
      while (remaining.length > 0) {
        const spaceLeft = maxWidth - currentWidth;
        if (spaceLeft <= 0) {
          pushLine();
          continue;
        }

        // Find how many characters fit
        let fitCount = 0;
        let fitWidth = 0;
        for (let i = 0; i < remaining.length; i++) {
          const charWidth = measureWidth(remaining[i], span.font);
          if (fitWidth + charWidth > spaceLeft && i > 0) break;
          fitWidth += charWidth;
          fitCount++;
        }
        if (fitCount === 0) {
          // Not even one char fits – start new line
          pushLine();
          fitCount = 1;
          fitWidth = measureWidth(remaining[0], span.font);
        }

        currentSpans.push({
          text: remaining.slice(0, fitCount),
          font: span.font,
          color: span.color,
          isCode: span.isCode,
        });
        currentWidth += fitWidth;
        remaining = remaining.slice(fitCount);
      }
    } else {
      // Span doesn't fit but is shorter than line – push to next line
      pushLine();
      currentSpans.push(span);
      currentWidth = baseIndent + spanWidth;
    }
  }

  pushLine();
  return lines;
}

/* ------------------------------------------------------------------ */
//  Block token → blocks
/* ------------------------------------------------------------------ */

function processBlockTokens(tokens: Token[], maxWidth: number): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'paragraph': {
        const spans = processInlineTokens(token.tokens || [], NORMAL_FONT, NORMAL_COLOR);
        const lines = wrapSpans(spans, maxWidth, 0, NORMAL_LINE_HEIGHT);
        if (lines.length > 0) {
          blocks.push({ lines, marginTop: 0, marginBottom: 8 });
        }
        break;
      }
      case 'heading': {
        const depth = (token as Token & { depth?: number }).depth ?? 1;
        const font =
          depth === 1 ? H1_FONT : depth === 2 ? H2_FONT : H3_FONT;
        const lineHeight =
          depth === 1 ? HEADING_LINE_HEIGHT + 4 : HEADING_LINE_HEIGHT;
        const spans = processInlineTokens(token.tokens || [], font, HEADING_COLOR);
        const lines = wrapSpans(spans, maxWidth, 0, lineHeight);
        if (lines.length > 0) {
          blocks.push({ lines, marginTop: depth === 1 ? 8 : 4, marginBottom: 8 });
        }
        break;
      }
      case 'list': {
        const ordered = (token as Token & { ordered?: boolean }).ordered ?? false;
        const items = (token as Token & { items?: Token[] }).items || [];
        let index = (token as Token & { start?: string }).start
          ? parseInt((token as Token & { start?: string }).start!, 10)
          : 1;

        for (const item of items) {
          const itemTokens = (item as Token & { tokens?: Token[] }).tokens || [];
          const spans = processInlineTokens(itemTokens, NORMAL_FONT, NORMAL_COLOR);

          const prefix = ordered ? `${index}. ` : '• ';
          const prefixWidth = measureWidth(prefix, NORMAL_FONT);
          const indent = ordered ? 20 : 16;

          // Prepend prefix as its own span
          const prefixSpan: MarkdownSpan = {
            text: prefix,
            font: NORMAL_FONT,
            color: LIST_BULLET_COLOR,
          };

          // First line gets the prefix; subsequent lines are indented
          const allLines: MarkdownLine[] = [];

          // Try to fit prefix + first span on first line
          let firstSpanWidth = 0;
          if (spans.length > 0) {
            firstSpanWidth = measureWidth(spans[0].text, spans[0].font);
          }

          if (prefixWidth + firstSpanWidth <= maxWidth - indent) {
            // Prefix + first span fit on same line
            const firstLineSpans = [prefixSpan, ...spans];
            const wrapped = wrapSpans(firstLineSpans, maxWidth, indent, NORMAL_LINE_HEIGHT);
            allLines.push(...wrapped);
          } else {
            // Prefix on its own line, then spans wrapped
            allLines.push({
              spans: [prefixSpan],
              indent,
              height: NORMAL_LINE_HEIGHT,
            });
            const wrapped = wrapSpans(spans, maxWidth, indent + prefixWidth, NORMAL_LINE_HEIGHT);
            allLines.push(...wrapped);
          }

          if (allLines.length > 0) {
            blocks.push({ lines: allLines, marginTop: 0, marginBottom: 4 });
          }
          if (ordered) index++;
        }

        // Add a little extra margin after the whole list
        if (blocks.length > 0) {
          const last = blocks[blocks.length - 1];
          last.marginBottom = 8;
        }
        break;
      }
      case 'blockquote': {
        const innerTokens = (token as Token & { tokens?: Token[] }).tokens || [];
        // Blockquote wraps paragraphs – process inner blocks with quote styling
        const innerBlocks = processBlockTokens(innerTokens, maxWidth - 20);
        for (const b of innerBlocks) {
          b.isBlockquote = true;
          b.blockquoteBarWidth = 3;
          // Shift lines slightly right for the bar
          for (const line of b.lines) {
            line.indent += 12;
          }
          // b.marginLeft = 0; // reserved
        }
        blocks.push(...innerBlocks);
        break;
      }
      case 'code': {
        const text = token.text || '';
        const lines = text.split('\n');
        const blockLines: MarkdownLine[] = [];
        for (const line of lines) {
          blockLines.push({
            spans: [{ text: line || ' ', font: CODE_FONT, color: CODE_COLOR, isCode: true }],
            indent: 8,
            height: CODE_LINE_HEIGHT,
            hasCodeBg: true,
          });
        }
        if (blockLines.length > 0) {
          blocks.push({
            lines: blockLines,
            marginTop: 8,
            marginBottom: 8,
          });
        }
        break;
      }
      case 'space':
        // Add a small spacer block
        blocks.push({ lines: [], marginTop: 4, marginBottom: 0 });
        break;
      case 'hr': {
        // Horizontal rule – rendered as a line
        blocks.push({
          lines: [{
            spans: [{ text: '', font: NORMAL_FONT, color: NORMAL_COLOR }],
            indent: 0,
            height: 12,
          }],
          marginTop: 8,
          marginBottom: 8,
        });
        break;
      }
      default:
        break;
    }
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
//  Public API
/* ------------------------------------------------------------------ */

export function layoutMarkdownDescription(
  markdown: string,
  maxWidth: number
): MarkdownLayout {
  const tokens = lexer(markdown);
  const blocks = processBlockTokens(tokens, maxWidth);

  let totalHeight = 0;
  let lineCount = 0;

  for (const block of blocks) {
    totalHeight += block.marginTop;
    for (const line of block.lines) {
      totalHeight += line.height;
      lineCount++;
    }
    totalHeight += block.marginBottom;
  }

  return { blocks, totalHeight, lineCount };
}

/* ------------------------------------------------------------------ */
//  Pagination
/* ------------------------------------------------------------------ */

function blockHeight(block: MarkdownBlock): number {
  let h = block.marginTop;
  for (const line of block.lines) {
    h += line.height;
  }
  h += block.marginBottom;
  return h;
}

function sliceBlockAtHeight(block: MarkdownBlock, maxH: number): {
  head: MarkdownBlock;
  tail: MarkdownBlock | null;
  consumed: number;
} {
  let remaining = maxH;
  const headLines: MarkdownLine[] = [];
  let consumed = 0;

  // Account for top margin on the first slice of this block
  if (block.marginTop > remaining) {
    // Not even margin fits – return empty head
    return {
      head: { lines: [], marginTop: 0, marginBottom: 0 },
      tail: { ...block },
      consumed: 0,
    };
  }

  remaining -= block.marginTop;
  consumed += block.marginTop;

  for (const line of block.lines) {
    if (line.height > remaining && headLines.length > 0) {
      break;
    }
    headLines.push(line);
    remaining -= line.height;
    consumed += line.height;
  }

  const tailLines = block.lines.slice(headLines.length);
  const tail: MarkdownBlock | null =
    tailLines.length > 0
      ? {
          lines: tailLines,
          marginTop: 0, // continuation loses top margin
          marginBottom: block.marginBottom,
          isBlockquote: block.isBlockquote,
          blockquoteBarWidth: block.blockquoteBarWidth,
        }
      : null;

  return {
    head: {
      lines: headLines,
      marginTop: block.marginTop,
      marginBottom: tail ? 0 : block.marginBottom,
      isBlockquote: block.isBlockquote,
      blockquoteBarWidth: block.blockquoteBarWidth,
    },
    tail,
    consumed,
  };
}

export function paginateMarkdownLayout(
  layout: MarkdownLayout,
  maxPageHeight: number
): MarkdownLayout[] {
  const pages: MarkdownLayout[] = [];
  let currentBlocks: MarkdownBlock[] = [];
  let currentHeight = 0;
  let currentLineCount = 0;

  function flushPage(): void {
    if (currentBlocks.length === 0) return;
    let totalHeight = 0;
    let lineCount = 0;
    for (const b of currentBlocks) {
      totalHeight += b.marginTop;
      for (const l of b.lines) {
        totalHeight += l.height;
        lineCount++;
      }
      totalHeight += b.marginBottom;
    }
    pages.push({ blocks: currentBlocks, totalHeight, lineCount });
    currentBlocks = [];
    currentHeight = 0;
    currentLineCount = 0;
  }

  for (const block of layout.blocks) {
    const bh = blockHeight(block);

    if (bh <= maxPageHeight) {
      // Whole block fits on a page
      if (currentHeight + bh > maxPageHeight && currentBlocks.length > 0) {
        flushPage();
      }
      currentBlocks.push(block);
      currentHeight += bh;
      currentLineCount += block.lines.length;
    } else {
      // Block too tall – need to slice
      let remainder: MarkdownBlock = { ...block };
      while (remainder.lines.length > 0) {
        const available = maxPageHeight - currentHeight;
        const slice = sliceBlockAtHeight(remainder, available > 0 ? available : maxPageHeight);

        if (slice.head.lines.length > 0 || slice.consumed > 0) {
          currentBlocks.push(slice.head);
          currentHeight += slice.consumed;
          currentLineCount += slice.head.lines.length;
        }

        if (slice.tail) {
          flushPage();
          remainder = slice.tail;
        } else {
          break;
        }
      }
    }
  }

  flushPage();
  return pages;
}

/* ------------------------------------------------------------------ */
//  Canvas drawing
/* ------------------------------------------------------------------ */

export function drawMarkdownDescription(
  ctx: CanvasRenderingContext2D,
  layout: MarkdownLayout,
  x: number,
  startY: number,
  nodeWidth: number
): void {
  let currentY = startY;

  for (const block of layout.blocks) {
    currentY += block.marginTop;

    // Draw blockquote left bar
    if (block.isBlockquote && block.blockquoteBarWidth) {
      ctx.save();
      ctx.fillStyle = BLOCKQUOTE_BORDER;
      const barHeight = block.lines.reduce((sum, l) => sum + l.height, 0);
      ctx.fillRect(x + 4, currentY, block.blockquoteBarWidth, barHeight);
      ctx.restore();
    }

    // Draw code block background
    if (block.lines.some((l) => l.hasCodeBg)) {
      ctx.save();
      ctx.fillStyle = CODE_BG;
      const codeHeight = block.lines.reduce((sum, l) => sum + l.height, 0);
      const codePadding = 6;
      // Calculate actual content width based on lines
      let maxContentWidth = 0;
      for (const line of block.lines) {
        let lineWidth = line.indent;
        for (const span of line.spans) {
          lineWidth += measureWidth(span.text, span.font);
        }
        maxContentWidth = Math.max(maxContentWidth, lineWidth);
      }
      const bgWidth = Math.min(maxContentWidth + codePadding * 2, nodeWidth - 4);
      roundRect(ctx, x + 2, currentY - codePadding, bgWidth, codeHeight + codePadding * 2, 4);
      ctx.fill();
      ctx.restore();
    }

    for (const line of block.lines) {
      let currentX = x + line.indent;

      for (const span of line.spans) {
        ctx.font = span.font;
        ctx.fillStyle = span.color;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(span.text, currentX, currentY);
        currentX += measureWidth(span.text, span.font);
      }

      currentY += line.height;
    }

    currentY += block.marginBottom;
  }
}

/* ------------------------------------------------------------------ */
//  Round-rect helper (duplicated from NodeRenderer for standalone use)
/* ------------------------------------------------------------------ */

function roundRect(
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
