import type { TextLayer } from '@forensicate/scanner';
import { detectZeroWidthChars, buildExtractionResult } from './utils';
import type { FileExtractionResult } from '@forensicate/scanner';

/**
 * Parse CSV content into rows, handling quoted fields.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuote) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // Skip escaped quote
      } else if (char === '"') {
        inQuote = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuote = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some(f => f.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        if (char === '\r') i++; // Skip \n in \r\n
      } else {
        currentField += char;
      }
    }
  }

  // Push last field/row
  currentRow.push(currentField);
  if (currentRow.some(f => f.trim())) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Extract text from CSV files with per-cell zero-width character detection.
 */
export async function extractFromCSV(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const rawText = await file.text();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  const rows = parseCSV(rawText);
  const allCellText: string[] = [];
  const hiddenCells: Array<{ row: number; col: number; hiddenChars: number; decoded: string }> = [];

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = rows[r][c];
      const { cleanText, hiddenChars, hasHidden } = detectZeroWidthChars(cell);
      allCellText.push(cleanText);

      if (hasHidden) {
        // Decode tag characters
        const decodedTagChars = hiddenChars
          .filter(h => h.code >= 0xE0000 && h.code <= 0xE007F)
          .map(h => String.fromCharCode(h.code - 0xE0000))
          .join('');

        hiddenCells.push({
          row: r + 1,
          col: c + 1,
          hiddenChars: hiddenChars.length,
          decoded: decodedTagChars,
        });
      }
    }
  }

  // Visible layer: all clean cell text
  layers.push({
    type: 'visible',
    content: allCellText.join('\n'),
    location: `${file.name} (${rows.length} rows)`,
  });

  // Hidden layers for cells with zero-width chars
  if (hiddenCells.length > 0) {
    const hiddenContent = hiddenCells
      .map(h => {
        const base = `Row ${h.row}, Col ${h.col}: ${h.hiddenChars} invisible chars`;
        return h.decoded ? `${base} (decodes to: "${h.decoded}")` : base;
      })
      .join('\n');

    layers.push({
      type: 'invisible-unicode',
      content: hiddenContent,
      location: `${file.name} (${hiddenCells.length} cells)`,
    });

    warnings.push(`${hiddenCells.length} cell(s) contain invisible unicode characters`);
  }

  return buildExtractionResult(file, 'csv', layers, startTime, warnings);
}
