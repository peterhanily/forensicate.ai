import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractFromPDF } from '../src/lib/fileExtractors/pdfExtractor';

const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn() }));
vi.mock('pdfjs-dist', () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: { workerSrc: '' },
}));

function documentFixture() {
  return {
    numPages: 1,
    getMetadata: vi.fn().mockResolvedValue({ info: { Title: 'Example document' } }),
    getPage: vi.fn().mockResolvedValue({
      getViewport: () => ({ width: 600, height: 800 }),
      getTextContent: async () => ({ items: [{ str: 'Hello world', transform: [12, 0, 0, 12, 30, 30], hasEOL: true }] }),
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
