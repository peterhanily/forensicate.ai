import type { TextLayer } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';
import type { FileExtractionResult } from '@forensicate/scanner';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Text item from PDF text content (subset of pdfjs-dist TextItem)
interface PDFTextItem {
  str: string;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, translateX, translateY]
  width: number;
  height: number;
  hasEOL?: boolean;
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
  const warnings: string[] = [];

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

    for (const item of textContent.items as PDFTextItem[]) {
      if (!item.str.trim()) continue;

      const [, , , scaleY, translateX, translateY] = item.transform;
      const fontSize = Math.abs(scaleY);

      // Detect zero/tiny font size (hidden text)
      if (fontSize < 0.5) {
        hiddenTexts.push(item.str);
        continue;
      }

      // Detect off-page positioning
      const isOffPage =
        translateX < -50 || translateX > viewport.width + 50 ||
        translateY < -50 || translateY > viewport.height + 50;

      if (isOffPage) {
        offPageTexts.push(item.str);
        continue;
      }

      // Normal visible text
      visibleTexts.push(item.str + (item.hasEOL ? '\n' : ' '));
    }
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
        location: 'PDF JavaScript',
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
