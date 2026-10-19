// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { pdfGeometryFixture } from './fixtures/pdfGeometry';
import { extractFromPDF } from '../src/lib/fileExtractors/pdfExtractor';

// Use the installed PDF parser and viewport implementation. Only the browser
// worker URL is substituted with its local Node-compatible counterpart.
vi.mock('pdfjs-dist', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (options: Parameters<typeof pdfjs.getDocument>[0]) => pdfjs.getDocument({
      ...(options as object), useSystemFonts: true,
    }),
  };
});

describe('PDF.js geometry fixtures', () => {
  it.each([
    ['ordinary text', {}],
    ['rotated glyphs', { textMatrix: [0, 1, -1, 0, 100, 100] }],
    ['rotated page', { rotate: 90, textMatrix: [1, 0, 0, 1, 500, 700] }],
    ['offset cropped page', { mediaBox: [0, 0, 1600, 2800], cropBox: [1000, 2000, 1600, 2800], textMatrix: [1, 0, 0, 1, 1200, 2200] }],
    ['rotated cropped page', { rotate: 270, mediaBox: [0, 0, 1600, 2800], cropBox: [1000, 2000, 1600, 2800], textMatrix: [1, 0, 0, 1, 1200, 2200] }],
  ])('extracts %s as visible without a hidden/off-page finding', async (_name, options) => {
    const bytes = pdfGeometryFixture(options);
    const file = new File([bytes], 'benign-layout.pdf', { type: 'application/pdf' });
    const result = await extractFromPDF(file);
    expect(result.visibleText).toBe('Hello world');
    expect(result.layers.filter(layer => ['hidden', 'off-page'].includes(layer.type))).toEqual([]);
    expect(result.warnings).not.toContainEqual(expect.stringMatching(/^Found/));
    expect(result.allText).not.toContain('No OCR');
  });
});
