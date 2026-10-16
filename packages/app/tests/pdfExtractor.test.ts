import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFromPDF } from '../src/lib/fileExtractors/pdfExtractor';

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn() }));
vi.mock('pdfjs-dist', () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: { workerSrc: '' },
}));

function documentFixture({
  transform = [12, 0, 0, 12, 30, 30],
  width = 60,
  viewportTransform = [1, 0, 0, -1, 0, 800],
  viewportWidth = 600,
  viewportHeight = 800,
  userUnit = 1,
} = {}) {
  return {
    numPages: 1,
    getMetadata: vi.fn().mockResolvedValue({ info: { Title: 'Example document' } }),
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({
        width: viewportWidth, height: viewportHeight, scale: 1, userUnit,
        convertToViewportPoint: (x: number, y: number) => {
          const [a, b, c, d, e, f] = viewportTransform;
          return [a * x + c * y + e, b * x + d * y + f];
        },
      }),
      getTextContent: async () => ({
        items: [{ str: 'Hello world', transform, width, height: 12, fontName: 'font', hasEOL: true }],
        styles: { font: { ascent: 0.8, descent: -0.2, vertical: false } },
      }),
      getAnnotations: async () => [],
    }),
    getJSActions: vi.fn().mockResolvedValue(null),
    getOptionalContentConfig: vi.fn().mockResolvedValue(new Map()),
  };
}

function pdfFile() {
  const file = new File(['example'], 'example.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(0) });
  return file;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('PDF extraction lifecycle', () => {
  it('extracts text and action source without executing it, then releases the worker', async () => {
    const document = documentFixture();
    document.getJSActions.mockResolvedValue(new Map([['OpenAction', ['// Example document action']]]));
    document.getOptionalContentConfig.mockResolvedValue(new Map([['layer-1', { name: 'Notes', visible: false }]]));
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });

    const result = await extractFromPDF(pdfFile());

    expect(result.visibleText).toBe('Hello world');
    expect(result.warnings).toContain('Found 1 hidden Optional Content Group(s): Notes');
    expect(result.layers).toContainEqual({ type: 'hidden', content: '// Example document action', location: 'PDF JavaScript' });
    expect(mocks.getDocument).toHaveBeenCalledWith({ data: expect.any(ArrayBuffer) });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('releases resources when document loading fails', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy: mocks.destroy });
    await expect(extractFromPDF(pdfFile())).rejects.toThrow('Invalid PDF');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('releases resources when page extraction fails', async () => {
    const document = documentFixture();
    document.getPage.mockRejectedValue(new Error('Unreadable page'));
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });
    await expect(extractFromPDF(pdfFile())).rejects.toThrow('Unreadable page');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('reports incomplete action inspection while preserving extracted text', async () => {
    const document = documentFixture();
    document.getJSActions.mockRejectedValue(new Error('Unreadable actions'));
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: mocks.destroy });
    const result = await extractFromPDF(pdfFile());
    expect(result.visibleText).toBe('Hello world');
    expect(result.warnings).toContain('Could not inspect PDF JavaScript actions');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});

describe('PDF text geometry', () => {
  it.each([
    ['quarter-turn text', { transform: [0, 12, -12, 0, 100, 100] }],
    ['rotated page', { transform: [12, 0, 0, 12, 500, 700], viewportTransform: [0, 1, 1, 0, 0, 0], viewportWidth: 800, viewportHeight: 600 }],
    ['offset crop box', { transform: [12, 0, 0, 12, 1200, 2200], viewportTransform: [1, 0, 0, -1, -1000, 2800] }],
    ['partially visible text', { transform: [12, 0, 0, 12, -80, 100], width: 120 }],
    ['font ascenders crossing the page boundary', { transform: [12, 0, 0, 12, 100, -5] }],
    ['enlarged PDF user units', { transform: [0.25, 0, 0, 0.25, 10, 10], viewportTransform: [4, 0, 0, -4, 0, 800], userUnit: 4 }],
  ])('keeps %s in the visible layer', async (_name, fixture) => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(documentFixture(fixture)), destroy: mocks.destroy });
    const result = await extractFromPDF(pdfFile());
    expect(result.visibleText).toBe('Hello world');
    expect(result.layers.filter(layer => ['hidden', 'off-page'].includes(layer.type))).toEqual([]);
  });

  it('classifies text entirely outside the crop box as off-page', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(documentFixture({
      transform: [12, 0, 0, 12, 100, 100], viewportTransform: [1, 0, 0, -1, -1000, 2800],
    })), destroy: mocks.destroy });
    const result = await extractFromPDF(pdfFile());
    expect(result.layers).toContainEqual(expect.objectContaining({ type: 'off-page', content: 'Hello world' }));
  });

  it('recognizes genuinely tiny text after rotation', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(documentFixture({ transform: [0, 0.1, -0.1, 0, 100, 100] })), destroy: mocks.destroy });
    const result = await extractFromPDF(pdfFile());
    expect(result.layers).toContainEqual(expect.objectContaining({ type: 'hidden', content: 'Hello world' }));
  });

  it('retains text with unknown geometry and keeps limitations out of scanned content', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve(documentFixture({ transform: [12, 0, 0, 12, Number.NaN, 100] })), destroy: mocks.destroy });
    const result = await extractFromPDF(pdfFile());
    expect(result.visibleText).toBe('Hello world');
    expect(result.warnings.some(warning => warning.includes('Could not assess all text geometry'))).toBe(true);
    expect(result.warnings.some(warning => warning.includes('No OCR'))).toBe(true);
    expect(result.allText).not.toMatch(/OCR|threat findings|geometry/);
  });
});
