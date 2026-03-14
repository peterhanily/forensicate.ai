import type { TextLayer, FileExtractionResult } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

/**
 * Check if an element is hidden via inline styles or attributes.
 */
function isElementHidden(element: Element): boolean {
  const style = element.getAttribute('style') || '';
  const lower = style.toLowerCase().replace(/\s/g, '');

  // display:none
  if (lower.includes('display:none')) return true;
  // visibility:hidden
  if (lower.includes('visibility:hidden')) return true;
  // opacity:0
  if (/opacity:0[^.]/.test(lower) || lower.endsWith('opacity:0')) return true;
  // font-size:0
  if (/font-size:0[^.]/.test(lower) || lower.endsWith('font-size:0') || lower.includes('font-size:0px') || lower.includes('font-size:0pt')) return true;
  // Off-screen positioning via large negative offsets
  const posMatch = lower.match(/(?:left|top|right|bottom):\s*(-?\d+)/g);
  if (posMatch) {
    for (const m of posMatch) {
      const num = parseInt(m.replace(/[^-\d]/g, ''), 10);
      if (num < -9000 || num > 9000) return true;
    }
  }

  // HTML hidden attribute
  if (element.hasAttribute('hidden')) return true;
  // aria-hidden="true"
  if (element.getAttribute('aria-hidden') === 'true') return true;

  return false;
}

/**
 * Parse inline color values to approximate luminance.
 * Returns a value between 0 (black) and 1 (white), or null if unparseable.
 */
function parseColorToLuminance(color: string): number | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();

  // Named colors
  if (c === 'white' || c === '#fff' || c === '#ffffff') return 1;
  if (c === 'black' || c === '#000' || c === '#000000') return 0;

  // Hex colors
  const hexMatch = c.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return null;
}

/**
 * Detect if inline styles create low-contrast text (WCAG ratio < 1.5:1).
 */
function detectLowContrastText(element: Element): boolean {
  const style = element.getAttribute('style') || '';
  if (!style) return false;

  const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  const bgMatch = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);

  if (!colorMatch || !bgMatch) return false;

  const fgLum = parseColorToLuminance(colorMatch[1]);
  const bgLum = parseColorToLuminance(bgMatch[1]);

  if (fgLum === null || bgLum === null) return false;

  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  const contrastRatio = (lighter + 0.05) / (darker + 0.05);

  return contrastRatio < 1.5;
}

/**
 * Recursively walk DOM tree and categorize text into layers.
 */
function walkDomTree(
  node: Node,
  layers: { visible: string[]; hidden: string[]; lowContrast: string[] },
) {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const text = node.textContent?.trim();
    if (!text) return;

    // Check parent chain for hidden
    let parentEl = node.parentElement;
    let isHidden = false;
    let isLowContrast = false;

    while (parentEl) {
      if (isElementHidden(parentEl)) {
        isHidden = true;
        break;
      }
      if (detectLowContrastText(parentEl)) {
        isLowContrast = true;
      }
      parentEl = parentEl.parentElement;
    }

    if (isHidden) {
      layers.hidden.push(text);
    } else if (isLowContrast) {
      layers.lowContrast.push(text);
    } else {
      layers.visible.push(text);
    }
    return;
  }

  if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

  const el = node as Element;
  const tag = el.tagName?.toLowerCase();

  // Skip script/style content
  if (tag === 'script' || tag === 'style' || tag === 'noscript') return;

  for (let i = 0; i < el.childNodes.length; i++) {
    walkDomTree(el.childNodes[i], layers);
  }
}

/**
 * Extract HTML comments using regex (DOMParser strips them).
 */
function extractHtmlComments(html: string): string[] {
  const comments: string[] = [];
  const regex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const content = match[1].trim();
    if (content) comments.push(content);
  }
  return comments;
}

/**
 * Extract text from HTML files with full DOM parsing.
 * Detects CSS-hidden elements, low-contrast text, and HTML comments.
 */
export async function extractFromHTMLDom(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const textLayers: TextLayer[] = [];
  const warnings: string[] = [];

  const html = await file.text();

  // Parse DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Walk DOM tree
  const collected = { visible: [] as string[], hidden: [] as string[], lowContrast: [] as string[] };
  walkDomTree(doc.body || doc.documentElement, collected);

  if (collected.visible.length > 0) {
    textLayers.push({
      type: 'visible',
      content: collected.visible.join(' '),
      location: file.name,
    });
  }

  if (collected.hidden.length > 0) {
    textLayers.push({
      type: 'hidden',
      content: collected.hidden.join(' '),
      location: 'CSS-hidden elements',
    });
    warnings.push(`Found ${collected.hidden.length} hidden text segment(s) via CSS/attributes`);
  }

  if (collected.lowContrast.length > 0) {
    textLayers.push({
      type: 'low-contrast',
      content: collected.lowContrast.join(' '),
      location: 'Low-contrast text (WCAG ratio < 1.5:1)',
    });
    warnings.push(`Found ${collected.lowContrast.length} low-contrast text segment(s)`);
  }

  // Extract HTML comments
  const comments = extractHtmlComments(html);
  if (comments.length > 0) {
    textLayers.push({
      type: 'comment',
      content: comments.join('\n'),
      location: 'HTML comments',
    });
    warnings.push(`Found ${comments.length} HTML comment(s)`);
  }

  return buildExtractionResult(file, 'html', textLayers, startTime, warnings);
}

// Export for reuse by email extractor
export { walkDomTree, extractHtmlComments, isElementHidden };
