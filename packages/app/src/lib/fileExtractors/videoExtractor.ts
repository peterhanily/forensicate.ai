// Video file extractor for Forensicate.ai
// Extracts metadata, embedded subtitles, and text content from MP4, WebM, MKV containers.
// Pure JavaScript — no external dependencies.

import type { FileExtractionResult, TextLayer } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

/**
 * Extract text layers from a video file.
 * Parses MP4 atoms (moov/udta/meta), WebM/MKV EBML metadata, and embedded subtitle tracks.
 */
export async function extractFromVideo(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  try {
    const buffer = await file.arrayBuffer();

    // Detect container format
    if (isMP4(buffer)) {
      const mp4Layers = parseMP4Metadata(buffer);
      layers.push(...mp4Layers);
    } else if (isWebM(buffer)) {
      const webmLayers = parseWebMMetadata(buffer);
      layers.push(...webmLayers);
    }

    // Generic text extraction from first portion of file
    const textStrings = extractReadableStrings(buffer);
    if (textStrings) {
      layers.push({
        type: 'metadata',
        content: textStrings,
        location: 'Embedded text strings in video container',
      });
    }

    // Look for embedded SRT/VTT content
    const subtitleContent = findEmbeddedSubtitles(buffer);
    if (subtitleContent) {
      layers.push({
        type: 'subtitle',
        content: subtitleContent,
        location: 'Embedded subtitle track',
      });
    }

    if (layers.length === 0) {
      warnings.push('No text metadata found in video file');
    }
  } catch (err) {
    warnings.push(`Video extraction error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return buildExtractionResult(file, 'video', layers, startTime, warnings);
}

// ---------------------------------------------------------------------------
// MP4 Container Parser
// ---------------------------------------------------------------------------

function isMP4(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  // Check for 'ftyp' atom
  const ftyp = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  return ftyp === 'ftyp';
}

function parseMP4Metadata(buffer: ArrayBuffer): TextLayer[] {
  const layers: TextLayer[] = [];
  const view = new DataView(buffer);
  const maxScan = Math.min(buffer.byteLength, 2 * 1024 * 1024); // Scan first 2MB

  // Walk MP4 atoms looking for metadata
  let offset = 0;
  while (offset + 8 < maxScan) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > buffer.byteLength) break;

    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7)
    );

    // Container atoms — recurse into them
    if (['moov', 'udta', 'meta', 'ilst', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) {
      const innerStart = type === 'meta' ? offset + 12 : offset + 8; // meta has 4-byte version/flags
      const innerEnd = offset + size;
      const innerLayers = parseMP4AtomsRange(view, buffer, innerStart, innerEnd);
      layers.push(...innerLayers);
    }

    offset += size;
  }

  return layers;
}

function parseMP4AtomsRange(view: DataView, buffer: ArrayBuffer, start: number, end: number): TextLayer[] {
  const layers: TextLayer[] = [];
  let offset = start;

  const metadataAtoms: Record<string, string> = {
    '\u00A9nam': 'Title',
    '\u00A9ART': 'Artist',
    '\u00A9alb': 'Album',
    '\u00A9cmt': 'Comment',
    '\u00A9day': 'Date',
    '\u00A9gen': 'Genre',
    '\u00A9lyr': 'Lyrics',
    '\u00A9des': 'Description',
    'desc': 'Description',
    '\u00A9too': 'Encoding Tool',
    'cprt': 'Copyright',
  };

  while (offset + 8 < end) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > end) break;

    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7)
    );

    const label = metadataAtoms[type];
    if (label) {
      // Try to extract text data from the atom
      const text = extractAtomText(buffer, offset + 8, offset + size);
      if (text.trim()) {
        layers.push({
          type: label === 'Lyrics' ? 'lyrics' : 'video-metadata',
          content: text.trim(),
          location: `MP4 ${label} atom`,
        });
      }
    }

    // Recurse into container-like atoms
    if (['moov', 'udta', 'meta', 'ilst', 'trak'].includes(type)) {
      const innerStart = type === 'meta' ? offset + 12 : offset + 8;
      layers.push(...parseMP4AtomsRange(view, buffer, innerStart, offset + size));
    }

    offset += size;
  }

  return layers;
}

// Regex for stripping control characters (U+0000–U+001F) — built dynamically to avoid no-control-regex lint
const CTRL_CHAR_RE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}]`, 'g');

function extractAtomText(buffer: ArrayBuffer, start: number, end: number): string {
  // MP4 metadata atoms often contain a 'data' sub-atom with the actual text
  const bytes = new Uint8Array(buffer, start, Math.min(end - start, 4096));
  // Try UTF-8 decode, filtering nulls
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      .replace(CTRL_CHAR_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// WebM/MKV (EBML) Parser
// ---------------------------------------------------------------------------

function isWebM(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new DataView(buffer);
  // EBML header: 0x1A45DFA3
  return view.getUint32(0) === 0x1A45DFA3;
}

function parseWebMMetadata(buffer: ArrayBuffer): TextLayer[] {
  const layers: TextLayer[] = [];
  // For WebM/MKV, extract readable text strings from the first portion
  // Full EBML parsing is complex; we use string extraction as a practical approach
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536)));

  // Look for common WebM/MKV metadata patterns
  const patterns = [
    { pattern: /TITLE[:\0]([^\0]{2,200})/gi, label: 'Title' },
    { pattern: /ARTIST[:\0]([^\0]{2,200})/gi, label: 'Artist' },
    { pattern: /COMMENT[:\0]([^\0]{2,200})/gi, label: 'Comment' },
    { pattern: /DESCRIPTION[:\0]([^\0]{2,200})/gi, label: 'Description' },
    { pattern: /DATE[:\0]([^\0]{2,100})/gi, label: 'Date' },
    { pattern: /SYNOPSIS[:\0]([^\0]{2,500})/gi, label: 'Synopsis' },
  ];

  for (const { pattern, label } of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1].replace(CTRL_CHAR_RE, '').trim();
      if (value.length >= 3) {
        layers.push({
          type: 'video-metadata',
          content: value,
          location: `WebM/MKV ${label}`,
        });
      }
    }
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Embedded subtitle detection
// ---------------------------------------------------------------------------

function findEmbeddedSubtitles(buffer: ArrayBuffer): string | null {
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024 * 1024)));

  // Look for SRT patterns (timestamps + text)
  const srtPattern = /\d+\r?\n\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\r?\n.+/g;
  const srtMatches = text.match(srtPattern);
  if (srtMatches && srtMatches.length >= 2) {
    return srtMatches.join('\n\n').slice(0, 5000);
  }

  // Look for WebVTT patterns
  if (text.includes('WEBVTT')) {
    const vttStart = text.indexOf('WEBVTT');
    const vttContent = text.slice(vttStart, vttStart + 5000);
    return vttContent;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generic readable string extraction
// ---------------------------------------------------------------------------

function extractReadableStrings(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 131072));
  const strings: string[] = [];
  let current = '';

  for (const byte of bytes) {
    if (byte >= 32 && byte < 127) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 20) strings.push(current);
      current = '';
    }
  }
  if (current.length >= 20) strings.push(current);

  const textLike = strings.filter(s => s.includes(' ') && s.length >= 20);
  if (textLike.length === 0) return null;

  return textLike.join('\n').slice(0, 5000);
}
