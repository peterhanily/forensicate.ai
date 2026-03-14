import type { TextLayer } from '@forensicate/scanner';
import { detectZeroWidthChars, buildExtractionResult } from './utils';
import type { FileExtractionResult } from '@forensicate/scanner';

/**
 * Extract text from plain text files (.txt, .md, .json, .xml, .log, .yaml).
 * Also detects hidden zero-width unicode characters.
 */
export async function extractFromText(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const rawText = await file.text();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  // Check for BOM
  if (rawText.charCodeAt(0) === 0xFEFF) {
    warnings.push('File contains a BOM (Byte Order Mark)');
  }

  // Detect zero-width characters
  const { cleanText, hiddenChars, hasHidden } = detectZeroWidthChars(rawText);

  // Add visible layer (cleaned text)
  layers.push({
    type: 'visible',
    content: cleanText,
    location: file.name,
  });

  // If hidden chars found, add as invisible-unicode layer
  if (hasHidden) {
    // Decode tag characters (U+E0000-U+E007F) to ASCII
    const decodedTagChars = hiddenChars
      .filter(h => h.code >= 0xE0000 && h.code <= 0xE007F)
      .map(h => String.fromCharCode(h.code - 0xE0000))
      .join('');

    const hiddenContent = decodedTagChars
      ? `${hiddenChars.length} invisible chars (${decodedTagChars.length} tag chars decode to: "${decodedTagChars}")`
      : `${hiddenChars.length} invisible unicode characters detected`;

    layers.push({
      type: 'invisible-unicode',
      content: hiddenContent,
      location: file.name,
    });

    warnings.push(`Found ${hiddenChars.length} zero-width/invisible unicode characters`);
  }

  return buildExtractionResult(file, 'text', layers, startTime, warnings);
}
