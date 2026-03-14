import type { FileType, FileExtractionResult, TextLayer } from '@forensicate/scanner';

/** Map MIME types to our FileType enum */
export const FILE_TYPE_MAP: Record<string, FileType> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/bmp': 'image',
  'image/tiff': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/csv': 'csv',
  'text/html': 'html',
  'text/plain': 'text',
  'text/markdown': 'text',
  'application/json': 'text',
  'application/xml': 'text',
  'text/xml': 'text',
  'image/svg+xml': 'svg',
  'message/rfc822': 'eml',
};

/** Supported MIME types for the file drop zone */
export const SUPPORTED_MIME_TYPES = Object.keys(FILE_TYPE_MAP);

/** Supported file extensions for fallback detection */
export const EXTENSION_TYPE_MAP: Record<string, FileType> = {
  '.pdf': 'pdf',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image',
  '.webp': 'image', '.bmp': 'image', '.tiff': 'image', '.tif': 'image',
  '.docx': 'docx',
  '.csv': 'csv',
  '.html': 'html', '.htm': 'html',
  '.txt': 'text', '.md': 'text', '.json': 'text', '.xml': 'text',
  '.log': 'text', '.yaml': 'text', '.yml': 'text',
  '.svg': 'svg',
  '.eml': 'eml',
};

/** Detect FileType from a File object */
export function detectFileType(file: File): FileType | null {
  // Try MIME type first
  if (file.type && FILE_TYPE_MAP[file.type]) {
    return FILE_TYPE_MAP[file.type];
  }
  // Fallback to extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return EXTENSION_TYPE_MAP[ext] ?? null;
}

/** Max file size in bytes (50MB) */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Human-readable file size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Zero-width character detection (shared between extractors)
const ZERO_WIDTH_CODEPOINTS = new Set([
  0x200B, 0x200C, 0x200D, 0xFEFF, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x180E,
]);

/** Detect zero-width characters in a string, returning cleaned text + hidden chars */
export function detectZeroWidthChars(text: string): {
  cleanText: string;
  hiddenChars: Array<{ char: string; code: number; position: number }>;
  hasHidden: boolean;
} {
  const hiddenChars: Array<{ char: string; code: number; position: number }> = [];
  let cleanText = '';

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (ZERO_WIDTH_CODEPOINTS.has(code) || (code >= 0xE0000 && code <= 0xE007F)) {
      hiddenChars.push({ char: text[i], code, position: i });
    } else {
      cleanText += text[i];
    }
    if (code > 0xFFFF) i++; // Skip surrogate pair
  }

  return { cleanText, hiddenChars, hasHidden: hiddenChars.length > 0 };
}

/** Build a standard FileExtractionResult from extracted layers */
export function buildExtractionResult(
  file: File,
  fileType: FileType,
  layers: TextLayer[],
  startTime: number,
  warnings: string[] = [],
  pageCount?: number,
): FileExtractionResult {
  const visibleLayers = layers.filter(l => l.type === 'visible');
  const hiddenLayers = layers.filter(l => l.type !== 'visible');

  const visibleText = visibleLayers.map(l => l.content).join('\n');
  const hiddenText = hiddenLayers.map(l => l.content).join('\n');
  const allText = layers.map(l => l.content).join('\n');

  return {
    filename: file.name,
    fileSize: file.size,
    fileType,
    mimeType: file.type || 'application/octet-stream',
    layers,
    visibleText,
    hiddenText,
    allText,
    extractionTimeMs: performance.now() - startTime,
    warnings,
    pageCount,
  };
}
