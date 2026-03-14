import type { TextLayer, FileExtractionResult } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let JSZip: any = null;

async function loadJSZip() {
  if (JSZip) return JSZip;
  const mod = await import('jszip');
  JSZip = mod.default || mod;
  return JSZip;
}

/**
 * Extract text from `<w:t>` elements in Word XML.
 * Also detects tracked changes (`<w:del>`, `<w:ins>`) and vanish text (`<w:vanish/>`).
 */
function extractFromDocumentXml(xml: string): {
  visible: string;
  tracked: string;
  vanish: string;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const visible: string[] = [];
  const tracked: string[] = [];
  const vanish: string[] = [];

  // Collect text from deleted/inserted tracked changes
  const delNodes = doc.getElementsByTagName('w:del');
  const trackedParents = new Set<Element>();
  for (let i = 0; i < delNodes.length; i++) {
    trackedParents.add(delNodes[i]);
    const texts = delNodes[i].getElementsByTagName('w:t');
    for (let j = 0; j < texts.length; j++) {
      const t = texts[j].textContent?.trim();
      if (t) tracked.push(t);
    }
  }

  const insNodes = doc.getElementsByTagName('w:ins');
  for (let i = 0; i < insNodes.length; i++) {
    trackedParents.add(insNodes[i]);
    const texts = insNodes[i].getElementsByTagName('w:t');
    for (let j = 0; j < texts.length; j++) {
      const t = texts[j].textContent?.trim();
      if (t) tracked.push(t);
    }
  }

  // Walk all w:r (run) elements for vanish detection and visible text
  const runs = doc.getElementsByTagName('w:r');
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];

    // Skip if inside a tracked change element
    let inTracked = false;
    let parent = run.parentElement;
    while (parent) {
      if (trackedParents.has(parent)) {
        inTracked = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (inTracked) continue;

    // Check for vanish property in run properties
    const rPr = run.getElementsByTagName('w:rPr')[0];
    const isVanish = rPr && rPr.getElementsByTagName('w:vanish').length > 0;

    const textNodes = run.getElementsByTagName('w:t');
    for (let j = 0; j < textNodes.length; j++) {
      const t = textNodes[j].textContent?.trim();
      if (!t) continue;

      if (isVanish) {
        vanish.push(t);
      } else {
        visible.push(t);
      }
    }
  }

  return {
    visible: visible.join(' '),
    tracked: tracked.join(' '),
    vanish: vanish.join(' '),
  };
}

/**
 * Extract text from DOCX comments XML.
 */
function extractComments(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const comments: string[] = [];

  const commentNodes = doc.getElementsByTagName('w:comment');
  for (let i = 0; i < commentNodes.length; i++) {
    const texts = commentNodes[i].getElementsByTagName('w:t');
    for (let j = 0; j < texts.length; j++) {
      const t = texts[j].textContent?.trim();
      if (t) comments.push(t);
    }
  }

  return comments.join(' ');
}

/**
 * Extract Dublin Core metadata from docProps.
 */
function extractMetadata(coreXml: string | null, appXml: string | null): string {
  const entries: string[] = [];
  const parser = new DOMParser();

  if (coreXml) {
    const doc = parser.parseFromString(coreXml, 'application/xml');
    const fields = ['dc:title', 'dc:creator', 'dc:subject', 'dc:description', 'cp:keywords', 'cp:category'];
    for (const field of fields) {
      const el = doc.getElementsByTagName(field)[0];
      const val = el?.textContent?.trim();
      if (val) entries.push(`${field.split(':')[1]}: ${val}`);
    }
  }

  if (appXml) {
    const doc = parser.parseFromString(appXml, 'application/xml');
    const fields = ['Company', 'Manager'];
    for (const field of fields) {
      const el = doc.getElementsByTagName(field)[0];
      const val = el?.textContent?.trim();
      if (val) entries.push(`${field}: ${val}`);
    }
  }

  return entries.join('\n');
}

/**
 * Extract text from DOCX files using JSZip + DOMParser.
 * Extracts visible text, tracked changes, vanish text, comments,
 * headers/footers, metadata, and custom XML.
 */
export async function extractFromDOCX(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  const jszip = await loadJSZip();
  const arrayBuffer = await file.arrayBuffer();

  let zip;
  try {
    zip = await jszip.loadAsync(arrayBuffer);
  } catch {
    throw new Error('Invalid or corrupt DOCX file');
  }

  // Extract document.xml (main body)
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) {
    throw new Error('DOCX missing word/document.xml');
  }

  const { visible, tracked, vanish } = extractFromDocumentXml(documentXml);

  if (visible) {
    layers.push({ type: 'visible', content: visible, location: 'Document body' });
  }

  if (tracked) {
    layers.push({ type: 'tracked-change', content: tracked, location: 'Tracked changes (deleted/inserted)' });
    warnings.push(`Found tracked changes with ${tracked.split(/\s+/).length} word(s)`);
  }

  if (vanish) {
    layers.push({ type: 'vanish-text', content: vanish, location: 'Hidden vanish text' });
    warnings.push(`Found vanish (hidden) text with ${vanish.split(/\s+/).length} word(s)`);
  }

  // Extract comments
  const commentsXml = await zip.file('word/comments.xml')?.async('string');
  if (commentsXml) {
    const commentText = extractComments(commentsXml);
    if (commentText) {
      layers.push({ type: 'comment', content: commentText, location: 'Document comments' });
    }
  }

  // Extract headers and footers
  const headerFooterTexts: string[] = [];
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if ((path.startsWith('word/header') || path.startsWith('word/footer')) && path.endsWith('.xml')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xml = await (zipEntry as any).async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');
      const texts = doc.getElementsByTagName('w:t');
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i].textContent?.trim();
        if (t) headerFooterTexts.push(t);
      }
    }
  }
  if (headerFooterTexts.length > 0) {
    layers.push({ type: 'header-footer', content: headerFooterTexts.join(' '), location: 'Headers/footers' });
  }

  // Extract metadata
  const coreXml = await zip.file('docProps/core.xml')?.async('string') ?? null;
  const appXml = await zip.file('docProps/app.xml')?.async('string') ?? null;
  const metadata = extractMetadata(coreXml, appXml);
  if (metadata) {
    layers.push({ type: 'doc-property', content: metadata, location: 'Document properties' });
  }

  // Extract custom XML
  const customXmlTexts: string[] = [];
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (path.startsWith('customXml/') && path.endsWith('.xml') && !path.includes('Props')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const xml = await (zipEntry as any).async('string');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) customXmlTexts.push(text);
    }
  }
  if (customXmlTexts.length > 0) {
    layers.push({ type: 'custom-xml', content: customXmlTexts.join('\n'), location: 'Custom XML parts' });
  }

  return buildExtractionResult(file, 'docx', layers, startTime, warnings);
}
