// Audio file extractor for Forensicate.ai
// Extracts metadata, lyrics, and text content from MP3 (ID3v2), WAV, OGG, and other audio files.
// Pure JavaScript — no external dependencies.

import type { FileExtractionResult, TextLayer } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

/**
 * Extract text layers from an audio file.
 * Reads ID3v2 tags (MP3), Vorbis comments (OGG), and basic metadata from audio containers.
 */
export async function extractFromAudio(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // Try ID3v2 parsing (MP3)
    if (buffer.byteLength >= 10) {
      const id3Layers = parseID3v2(view, buffer);
      layers.push(...id3Layers);
    }

    // Try Vorbis comment parsing (OGG/FLAC)
    if (hasOggHeader(view)) {
      const oggLayers = parseOggMetadata(buffer);
      layers.push(...oggLayers);
    }

    // Generic text search — scan raw bytes for readable text strings
    // that might contain injection content
    const textStrings = extractReadableStrings(buffer);
    if (textStrings) {
      layers.push({
        type: 'metadata',
        content: textStrings,
        location: 'Embedded text strings',
      });
    }

    if (layers.length === 0) {
      warnings.push('No text metadata found in audio file');
    }
  } catch (err) {
    warnings.push(`Audio extraction error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return buildExtractionResult(file, 'audio', layers, startTime, warnings);
}

// ---------------------------------------------------------------------------
// ID3v2 Parser (MP3)
// ---------------------------------------------------------------------------

function parseID3v2(view: DataView, buffer: ArrayBuffer): TextLayer[] {
  const layers: TextLayer[] = [];

  // Check for "ID3" header
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return layers;
  }

  const version = view.getUint8(3);
  // ID3v2 size (synchsafe integer — each byte uses only 7 bits)
  const size = ((view.getUint8(6) & 0x7F) << 21) | ((view.getUint8(7) & 0x7F) << 14) |
               ((view.getUint8(8) & 0x7F) << 7) | (view.getUint8(9) & 0x7F);

  if (size <= 0 || size > buffer.byteLength) return layers;

  // Frame parsing
  let offset = 10;
  const end = Math.min(10 + size, buffer.byteLength);

  const MAX_FRAMES = 500; // Prevent DoS from malformed tags
  let frameCount = 0;

  while (offset + 10 < end && frameCount < MAX_FRAMES) {
    frameCount++;

    // Frame ID (4 chars for v2.3+, 3 chars for v2.2)
    const frameIdSize = version >= 3 ? 4 : 3;
    const frameId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      ...(frameIdSize === 4 ? [view.getUint8(offset + 3)] : [])
    );

    // Skip padding (null bytes indicate end of frames)
    if (frameId[0] === '\0') break;

    // Frame data size
    let dataSize: number;
    const headerSize = version >= 3 ? 10 : 6;
    if (version >= 3) {
      dataSize = (view.getUint8(offset + 4) << 24) | (view.getUint8(offset + 5) << 16) |
                 (view.getUint8(offset + 6) << 8) | view.getUint8(offset + 7);
    } else {
      dataSize = (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5);
    }

    offset += headerSize;

    // Validate data size before accessing
    if (dataSize <= 0 || dataSize > 10_000_000 || offset + dataSize > end) break;

    // Text frames (T*** except TXXX)
    const textFrames: Record<string, string> = {
      'TIT2': 'Title', 'TIT1': 'Title', 'TT2': 'Title',
      'TPE1': 'Artist', 'TPE2': 'Artist', 'TP1': 'Artist',
      'TALB': 'Album', 'TAL': 'Album',
      'TCOM': 'Composer', 'TCM': 'Composer',
      'TCON': 'Genre', 'TCO': 'Genre',
      'COMM': 'Comment', 'COM': 'Comment',
      'TXXX': 'User-Defined',
      'USLT': 'Lyrics', 'ULT': 'Lyrics',
      'SYLT': 'Synchronized Lyrics', 'SLT': 'Synchronized Lyrics',
      'TIT3': 'Subtitle',
      'TDRC': 'Recording Date', 'TYER': 'Year', 'TYE': 'Year',
      'TCOP': 'Copyright',
    };

    const frameName = textFrames[frameId];
    if (frameName) {
      try {
        const frameData = new Uint8Array(buffer, offset, dataSize);
        const text = decodeID3Text(frameData);
        if (text.trim()) {
          const layerType = (frameName === 'Lyrics' || frameName === 'Synchronized Lyrics') ? 'lyrics' as const : 'audio-metadata' as const;
          layers.push({
            type: layerType,
            content: text.trim(),
            location: `ID3v2 ${frameName} (${frameId})`,
          });
        }
      } catch {
        // Skip unparseable frames
      }
    }

    offset += dataSize;
  }

  return layers;
}

function decodeID3Text(data: Uint8Array): string {
  if (data.length < 2) return '';
  const encoding = data[0];

  // 0 = ISO-8859-1, 1 = UTF-16 with BOM, 2 = UTF-16BE, 3 = UTF-8
  const textBytes = data.slice(1);

  if (encoding === 3 || encoding === 0) {
    return new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1').decode(textBytes).replace(/\0/g, '');
  }
  if (encoding === 1 || encoding === 2) {
    return new TextDecoder('utf-16').decode(textBytes).replace(/\0/g, '');
  }
  return new TextDecoder('utf-8').decode(textBytes).replace(/\0/g, '');
}

// ---------------------------------------------------------------------------
// OGG Vorbis Comment Parser
// ---------------------------------------------------------------------------

function hasOggHeader(view: DataView): boolean {
  if (view.byteLength < 4) return false;
  return view.getUint8(0) === 0x4F && view.getUint8(1) === 0x67 &&
         view.getUint8(2) === 0x67 && view.getUint8(3) === 0x53; // "OggS"
}

function parseOggMetadata(buffer: ArrayBuffer): TextLayer[] {
  const layers: TextLayer[] = [];
  const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536)));

  // Look for Vorbis comment fields (KEY=VALUE format)
  const commentPattern = /(?:TITLE|ARTIST|ALBUM|COMMENT|LYRICS|DESCRIPTION|GENRE|DATE|COPYRIGHT)=([^\0]+)/gi;
  let match;
  while ((match = commentPattern.exec(text)) !== null) {
    const key = match[0].split('=')[0];
    const value = match[1];
    if (value.trim()) {
      layers.push({
        type: key.toUpperCase() === 'LYRICS' ? 'lyrics' : 'audio-metadata',
        content: value.trim(),
        location: `Vorbis Comment (${key})`,
      });
    }
  }

  return layers;
}

// ---------------------------------------------------------------------------
// Generic readable string extraction
// ---------------------------------------------------------------------------

function extractReadableStrings(buffer: ArrayBuffer): string | null {
  // Scan for readable ASCII strings >= 8 chars that might contain injection
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 131072)); // First 128KB
  const strings: string[] = [];
  let current = '';

  for (const byte of bytes) {
    if (byte >= 32 && byte < 127) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 20) { // Only keep substantial strings
        strings.push(current);
      }
      current = '';
    }
  }
  if (current.length >= 20) strings.push(current);

  // Filter to strings that look like natural language (have spaces)
  const textLike = strings.filter(s => s.includes(' ') && s.length >= 20);
  if (textLike.length === 0) return null;

  return textLike.join('\n').slice(0, 5000);
}
