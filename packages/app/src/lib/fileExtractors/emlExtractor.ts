import type { TextLayer, FileExtractionResult } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

/**
 * Decode quoted-printable encoded text.
 * Handles =XX hex encoding and soft line breaks (=\r\n).
 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '') // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Decode base64 encoded text.
 */
function decodeBase64(encoded: string): string {
  try {
    return atob(encoded.replace(/\s/g, ''));
  } catch {
    return '';
  }
}

interface MimeHeader {
  from: string;
  to: string;
  subject: string;
  date: string;
  contentType: string;
  contentTransferEncoding: string;
  allHeaders: string[];
}

interface MimePart {
  contentType: string;
  encoding: string;
  body: string;
}

/**
 * Parse MIME headers from raw email text.
 * Returns headers and the index where the body begins.
 */
function parseHeaders(raw: string): { headers: MimeHeader; bodyStart: number } {
  const headerEnd = raw.indexOf('\r\n\r\n');
  const altHeaderEnd = raw.indexOf('\n\n');
  const splitIdx = headerEnd !== -1 ? headerEnd : altHeaderEnd;
  const headerSep = headerEnd !== -1 ? '\r\n\r\n' : '\n\n';
  const bodyStart = splitIdx !== -1 ? splitIdx + headerSep.length : raw.length;
  const headerBlock = raw.substring(0, splitIdx !== -1 ? splitIdx : raw.length);

  // Unfold continuation lines (lines starting with whitespace)
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
  const lines = unfolded.split(/\r?\n/);

  const headers: MimeHeader = {
    from: '',
    to: '',
    subject: '',
    date: '',
    contentType: '',
    contentTransferEncoding: '',
    allHeaders: [],
  };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const name = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();
    headers.allHeaders.push(`${name}: ${value}`);

    switch (name) {
      case 'from': headers.from = value; break;
      case 'to': headers.to = value; break;
      case 'subject': headers.subject = value; break;
      case 'date': headers.date = value; break;
      case 'content-type': headers.contentType = value; break;
      case 'content-transfer-encoding': headers.contentTransferEncoding = value; break;
    }
  }

  return { headers, bodyStart };
}

/**
 * Extract boundary from Content-Type header.
 */
function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  return match ? match[1] : null;
}

/**
 * Parse a multipart MIME body into parts.
 */
function parseMultipartBody(body: string, boundary: string): MimePart[] {
  const parts: MimePart[] = [];
  const delimiter = `--${boundary}`;
  const sections = body.split(delimiter);

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (section.startsWith('--')) break; // End boundary

    const { headers, bodyStart } = parseHeaders(section);
    const partBody = section.substring(bodyStart).trim();

    parts.push({
      contentType: headers.contentType || 'text/plain',
      encoding: headers.contentTransferEncoding || '7bit',
      body: partBody,
    });

    // Recursively handle nested multipart
    const nestedBoundary = extractBoundary(headers.contentType);
    if (nestedBoundary) {
      const nested = parseMultipartBody(partBody, nestedBoundary);
      parts.push(...nested);
    }
  }

  return parts;
}

/**
 * Decode a MIME part body based on its transfer encoding.
 */
function decodePart(part: MimePart): string {
  const encoding = part.encoding.toLowerCase();
  if (encoding === 'base64') {
    return decodeBase64(part.body);
  }
  if (encoding === 'quoted-printable') {
    return decodeQuotedPrintable(part.body);
  }
  return part.body;
}

/**
 * Basic hidden HTML detection for email HTML parts.
 * Checks for display:none, visibility:hidden, opacity:0, font-size:0.
 */
function extractHiddenFromHtml(html: string): { visible: string; hidden: string; comments: string[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const visible: string[] = [];
  const hidden: string[] = [];

  function walk(node: Node) {
    if (node.nodeType === 3) {
      const text = node.textContent?.trim();
      if (!text) return;

      let parentEl = node.parentElement;
      let isHidden = false;
      while (parentEl) {
        const style = (parentEl.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
        if (style.includes('display:none') || style.includes('visibility:hidden') ||
            (/opacity:0[^.]/.test(style) || style.endsWith('opacity:0')) ||
            style.includes('font-size:0')) {
          isHidden = true;
          break;
        }
        if (parentEl.hasAttribute('hidden') || parentEl.getAttribute('aria-hidden') === 'true') {
          isHidden = true;
          break;
        }
        parentEl = parentEl.parentElement;
      }

      if (isHidden) hidden.push(text);
      else visible.push(text);
      return;
    }

    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName?.toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
    }
  }

  walk(doc.body || doc.documentElement);

  // Extract comments
  const comments: string[] = [];
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRegex.exec(html)) !== null) {
    const content = match[1].trim();
    if (content) comments.push(content);
  }

  return { visible: visible.join(' '), hidden: hidden.join(' '), comments };
}

/**
 * Extract text from email (.eml) files.
 * Parses MIME structure, handles multipart, base64, quoted-printable.
 * Detects hidden HTML elements and injection in headers.
 */
export async function extractFromEml(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  const raw = await file.text();
  const { headers, bodyStart } = parseHeaders(raw);
  const body = raw.substring(bodyStart);

  // Add metadata layer (headers)
  const metadataFields = [
    headers.from && `From: ${headers.from}`,
    headers.to && `To: ${headers.to}`,
    headers.subject && `Subject: ${headers.subject}`,
    headers.date && `Date: ${headers.date}`,
  ].filter(Boolean);
  if (metadataFields.length > 0) {
    layers.push({ type: 'metadata', content: metadataFields.join('\n'), location: 'Email headers' });
  }

  // Parse body
  const boundary = extractBoundary(headers.contentType);
  const visibleTexts: string[] = [];
  const hiddenTexts: string[] = [];
  const commentTexts: string[] = [];

  if (boundary) {
    // Multipart message
    const parts = parseMultipartBody(body, boundary);
    for (const part of parts) {
      const decoded = decodePart(part);
      const ct = part.contentType.toLowerCase();

      if (ct.startsWith('text/html')) {
        const { visible, hidden, comments } = extractHiddenFromHtml(decoded);
        if (visible) visibleTexts.push(visible);
        if (hidden) hiddenTexts.push(hidden);
        commentTexts.push(...comments);
      } else if (ct.startsWith('text/plain')) {
        visibleTexts.push(decoded);
      }
    }
  } else {
    // Single-part message
    const ct = headers.contentType.toLowerCase();
    const encoding = headers.contentTransferEncoding.toLowerCase();
    let decoded = body;

    if (encoding === 'base64') decoded = decodeBase64(body);
    else if (encoding === 'quoted-printable') decoded = decodeQuotedPrintable(body);

    if (ct.includes('text/html')) {
      const { visible, hidden, comments } = extractHiddenFromHtml(decoded);
      if (visible) visibleTexts.push(visible);
      if (hidden) hiddenTexts.push(hidden);
      commentTexts.push(...comments);
    } else {
      visibleTexts.push(decoded);
    }
  }

  if (visibleTexts.length > 0) {
    layers.push({ type: 'visible', content: visibleTexts.join('\n'), location: 'Email body' });
  }

  if (hiddenTexts.length > 0) {
    layers.push({ type: 'hidden', content: hiddenTexts.join('\n'), location: 'Hidden HTML in email' });
    warnings.push(`Found ${hiddenTexts.length} hidden text segment(s) in email HTML`);
  }

  if (commentTexts.length > 0) {
    layers.push({ type: 'comment', content: commentTexts.join('\n'), location: 'HTML comments in email' });
  }

  return buildExtractionResult(file, 'eml', layers, startTime, warnings);
}
