import type { TextLayer, FileExtractionResult } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

/**
 * Check if an SVG element is hidden via attributes or inline styles.
 */
function isSvgElementHidden(element: Element): boolean {
  const style = (element.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
  if (style.includes('display:none')) return true;
  if (/opacity:0[^.]/.test(style) || style.endsWith('opacity:0')) return true;
  if (style.includes('visibility:hidden')) return true;

  // Check direct attributes
  if (element.getAttribute('display') === 'none') return true;
  if (element.getAttribute('opacity') === '0') return true;
  if (element.getAttribute('visibility') === 'hidden') return true;

  return false;
}

/**
 * Extract text from SVG files using native DOMParser XML parsing.
 * Detects visible text, hidden text, metadata, comments, scripts, and foreignObject.
 */
export async function extractFromSVG(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  const svgText = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    warnings.push('SVG parse error detected — file may be malformed');
  }

  const visibleTexts: string[] = [];
  const hiddenTexts: string[] = [];
  const metadataTexts: string[] = [];
  const scriptTexts: string[] = [];

  // Extract <text> and <tspan> elements
  const textElements = doc.querySelectorAll('text, tspan');
  for (let i = 0; i < textElements.length; i++) {
    const el = textElements[i];
    const content = el.textContent?.trim();
    if (!content) continue;

    // Check if hidden (element itself or any ancestor)
    let hidden = false;
    let current: Element | null = el;
    while (current) {
      if (isSvgElementHidden(current)) {
        hidden = true;
        break;
      }
      current = current.parentElement;
    }

    if (hidden) {
      hiddenTexts.push(content);
    } else {
      visibleTexts.push(content);
    }
  }

  // Extract <desc> and <title> (polyglot SVG attack vector)
  const descElements = doc.querySelectorAll('desc, title');
  for (let i = 0; i < descElements.length; i++) {
    const content = descElements[i].textContent?.trim();
    if (content) metadataTexts.push(content);
  }

  // Extract <metadata> elements (XMP/RDF injection)
  const metadataElements = doc.querySelectorAll('metadata');
  for (let i = 0; i < metadataElements.length; i++) {
    const content = metadataElements[i].textContent?.trim();
    if (content) metadataTexts.push(content);
  }

  // Extract <script> content (code injection)
  const scriptElements = doc.querySelectorAll('script');
  for (let i = 0; i < scriptElements.length; i++) {
    const content = scriptElements[i].textContent?.trim();
    if (content) scriptTexts.push(content);
  }

  // Extract <foreignObject> content (embedded HTML injection)
  const foreignElements = doc.querySelectorAll('foreignObject');
  for (let i = 0; i < foreignElements.length; i++) {
    const content = foreignElements[i].textContent?.trim();
    if (content) hiddenTexts.push(content);
  }

  // Extract SVG comments
  const comments: string[] = [];
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRegex.exec(svgText)) !== null) {
    const content = match[1].trim();
    if (content) comments.push(content);
  }

  // Build layers
  if (visibleTexts.length > 0) {
    layers.push({ type: 'visible', content: visibleTexts.join(' '), location: 'SVG text elements' });
  }

  if (hiddenTexts.length > 0) {
    layers.push({ type: 'hidden', content: hiddenTexts.join(' '), location: 'Hidden SVG elements (display:none, opacity:0, foreignObject)' });
    warnings.push(`Found ${hiddenTexts.length} hidden text segment(s) in SVG`);
  }

  if (metadataTexts.length > 0) {
    layers.push({ type: 'metadata', content: metadataTexts.join('\n'), location: 'SVG desc/title/metadata elements' });
  }

  if (scriptTexts.length > 0) {
    layers.push({ type: 'hidden', content: scriptTexts.join('\n'), location: 'SVG <script> elements' });
    warnings.push(`Found ${scriptTexts.length} <script> element(s) in SVG`);
  }

  if (comments.length > 0) {
    layers.push({ type: 'comment', content: comments.join('\n'), location: 'SVG comments' });
  }

  return buildExtractionResult(file, 'svg', layers, startTime, warnings);
}
