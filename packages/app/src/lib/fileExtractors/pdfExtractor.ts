import type { TextLayer } from '@forensicate/scanner';
import { buildExtractionResult, PDF_JAVASCRIPT_LOCATION } from './utils';
import type { FileExtractionResult } from '@forensicate/scanner';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api';

type PDFViewport = ReturnType<PDFPageProxy['getViewport']>;

/** Estimate the text quad in the displayed crop box, including page rotation. */
function textGeometry(item: TextItem, style: TextStyle | undefined, viewport: PDFViewport) {
  const [a, b, c, d, x, y] = item.transform as number[];
  if (![a, b, c, d, x, y, item.width, item.height].every(Number.isFinite)) return null;

  const origin = viewport.convertToViewportPoint(x, y);
  const xPoint = viewport.convertToViewportPoint(x + a, y + b);
  const yPoint = viewport.convertToViewportPoint(x + c, y + d);
  if (![...origin, ...xPoint, ...yPoint, viewport.width, viewport.height].every(Number.isFinite)) return null;
  let baseline = [xPoint[0] - origin[0], xPoint[1] - origin[1]];
  let up = [yPoint[0] - origin[0], yPoint[1] - origin[1]];
  // PDF.js lays vertical text out at a further quarter turn from its text matrix.
  if (style?.vertical) {
    baseline = [-baseline[1], baseline[0]];
    up = [-up[1], up[0]];
  }
  const fontSize = Math.hypot(...up);
  const baselineLength = Math.hypot(...baseline);
  if (![fontSize, baselineLength].every(Number.isFinite)) return null;
  if (fontSize < 0.5) return { tiny: true, offPage: false };
  if (!baselineLength) return null;

  const advance = Math.abs(style?.vertical ? item.height : item.width) * viewport.scale * viewport.userUnit;
  const end = origin.map((value, index) => value + baseline[index] * advance / baselineLength);
  const ascent = Number.isFinite(style?.ascent) ? style!.ascent : 1;
  const descent = Number.isFinite(style?.descent) ? style!.descent : -0.25;
  const corners = [origin, end].flatMap(point => [ascent, descent].map(metric =>
    point.map((value, index) => value + up[index] * metric),
  ));
  if (!corners.flat().every(Number.isFinite)) return null;
  const xs = corners.map(point => point[0]);
  const ys = corners.map(point => point[1]);
  // Only classify a complete quad outside the page; a clipped baseline can
  // still have visible glyphs. One viewport unit allows for font rounding.
  const offPage = Math.max(...xs) < -1 || Math.min(...xs) > viewport.width + 1 ||
    Math.max(...ys) < -1 || Math.min(...ys) > viewport.height + 1;
  return { tiny: false, offPage };
}

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  // Set worker source to bundled worker
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  pdfjsLib = pdfjs;
  return pdfjs;
}

/**
 * Extract text from PDF files with hidden text detection.
 * Detects: zero-font-size text, off-page text, metadata injection.
 */
export async function extractFromPDF(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  try {
    const pdf = await loadingTask.promise;
    return await extractDocument(pdf, file, startTime);
  } finally {
    // Release the worker and document buffers even when parsing fails.
    await loadingTask.destroy();
  }
}

async function extractDocument(pdf: PDFDocumentProxy, file: File, startTime: number): Promise<FileExtractionResult> {
  const layers: TextLayer[] = [];
  const warnings: string[] = [
    'PDF visibility is estimated from text geometry; clipping, text colour and image content are not fully inspected. No OCR is performed. These limits are not threat findings.',
  ];

  // Extract metadata
  try {
    const metadata = await pdf.getMetadata();
    const metaFields = metadata.info;
    const metaEntries: string[] = [];

    for (const [key, value] of Object.entries(metaFields)) {
      if (typeof value === 'string' && value.trim()) {
        metaEntries.push(`${key}: ${value}`);
      }
    }

    if (metaEntries.length > 0) {
      layers.push({
        type: 'metadata',
        content: metaEntries.join('\n'),
        location: 'PDF metadata',
      });
    }
  } catch {
    warnings.push('Could not extract PDF metadata');
  }

  // Extract text from each page
  const visibleTexts: string[] = [];
  const hiddenTexts: string[] = [];
  const offPageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    let geometryIncomplete = false;
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const geometry = textGeometry(item, textContent.styles[item.fontName], viewport);
      if (!geometry) geometryIncomplete = true;

      // Detect zero/tiny font size (hidden text)
      if (geometry?.tiny) {
        hiddenTexts.push(item.str);
        continue;
      }

      // Detect off-page positioning
      if (geometry?.offPage) {
        offPageTexts.push(item.str);
        continue;
      }

      // Normal visible text
      visibleTexts.push(item.str + (item.hasEOL ? '\n' : ' '));
    }
    if (geometryIncomplete) warnings.push(`Could not assess all text geometry on page ${pageNum}; extracted text was retained for scanning`);
  }

  // Add visible text layer
  if (visibleTexts.length > 0) {
    layers.push({
      type: 'visible',
      content: visibleTexts.join('').trim(),
      location: `${pdf.numPages} page(s)`,
    });
  }

  // Add hidden text layer (zero font size)
  if (hiddenTexts.length > 0) {
    layers.push({
      type: 'hidden',
      content: hiddenTexts.join(' '),
      location: 'Zero/tiny font size text',
    });
    warnings.push(`Found ${hiddenTexts.length} hidden text segment(s) with zero/tiny font size`);
  }

  // Add off-page text layer
  if (offPageTexts.length > 0) {
    layers.push({
      type: 'off-page',
      content: offPageTexts.join(' '),
      location: 'Text positioned outside visible page area',
    });
    warnings.push(`Found ${offPageTexts.length} text segment(s) positioned off-page`);
  }

  // Extract JavaScript (potential exfiltration/execution)
  try {
    const actions = await pdf.getJSActions();
    const js = actions ? [...actions.values()].flat().filter((value): value is string => typeof value === 'string') : [];
    if (js.length > 0) {
      const jsContent = js.join('\n');
      layers.push({
        type: 'hidden',
        content: jsContent,
        location: PDF_JAVASCRIPT_LOCATION,
      });
      warnings.push(`Found ${js.length} JavaScript action(s) in PDF`);
    }
  } catch {
    warnings.push('Could not inspect PDF JavaScript actions');
  }

  // Extract AcroForm field values
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const annotations = await page.getAnnotations();
      const formValues: string[] = [];

      for (const annot of annotations) {
        if (annot.subtype === 'Widget' && annot.fieldValue) {
          const val = typeof annot.fieldValue === 'string' ? annot.fieldValue : String(annot.fieldValue);
          if (val.trim()) formValues.push(`${annot.fieldName || 'field'}: ${val}`);
        }
      }

      if (formValues.length > 0) {
        layers.push({
          type: 'metadata',
          content: formValues.join('\n'),
          location: `Form fields (page ${pageNum})`,
        });
      }
    }
  } catch {
    // Annotations API may fail on some PDFs
  }

  // Detect Optional Content Groups (hidden layers)
  try {
    const ocgConfig = await pdf.getOptionalContentConfig();
    if (ocgConfig) {
      const hiddenGroups: string[] = [];
      for (const [id, group] of ocgConfig) {
        if (group && group.visible === false) {
          hiddenGroups.push(group.name || id);
        }
      }
      if (hiddenGroups.length > 0) {
        warnings.push(`Found ${hiddenGroups.length} hidden Optional Content Group(s): ${hiddenGroups.join(', ')}`);
      }
    }
  } catch {
    warnings.push('Could not inspect PDF optional content groups');
  }

  return buildExtractionResult(file, 'pdf', layers, startTime, warnings, pdf.numPages);
}
