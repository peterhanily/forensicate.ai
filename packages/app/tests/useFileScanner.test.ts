import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_LENGTH, ScanInputTooLargeError, type FileExtractionResult } from '@forensicate/scanner';
import { useFileScanner } from '../src/hooks/useFileScanner';
import { extractTextFromFile } from '../src/lib/fileExtractors';

vi.mock('../src/lib/fileExtractors', () => ({ extractTextFromFile: vi.fn() }));

function deferred() {
  let resolve!: (value: FileExtractionResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<FileExtractionResult>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function extraction(filename: string): FileExtractionResult {
  return {
    filename, fileSize: 5, fileType: 'text', mimeType: 'text/plain', layers: [],
    visibleText: 'Hello', hiddenText: '', allText: 'Hello', extractionTimeMs: 1, warnings: [],
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('file selection lifecycle', () => {
  it('rejects oversized extracted text without retaining a previous successful scan', async () => {
    vi.mocked(extractTextFromFile).mockResolvedValueOnce(extraction('small.txt'));
    const { result } = renderHook(() => useFileScanner());
    await act(async () => { await result.current.handleFileSelected(new File([], 'small.txt')); });
    expect(result.current.fileScanResult).not.toBeNull();
    const large = { ...extraction('large.txt'), allText: 'a'.repeat(MAX_SCAN_LENGTH + 1) };
    vi.mocked(extractTextFromFile).mockResolvedValueOnce(large);
    await act(async () => {
      await expect(result.current.handleFileSelected(new File([], 'large.txt'))).rejects.toThrow(ScanInputTooLargeError);
    });
    expect(result.current.fileScanResult).toBeNull();
    expect(result.current.fileExtractionResult).toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });

  it('keeps the newest result when an earlier extraction finishes last', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(extractTextFromFile).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useFileScanner());
    let firstScan!: Promise<void>;
    let secondScan!: Promise<void>;
    act(() => { firstScan = result.current.handleFileSelected(new File([], 'first.txt')); });
    act(() => { secondScan = result.current.handleFileSelected(new File([], 'second.txt')); });
    await act(async () => { second.resolve(extraction('second.txt')); await secondScan; });
    await act(async () => { first.resolve(extraction('first.txt')); await firstScan; });
    expect(result.current.fileScanResult?.fileInfo.filename).toBe('second.txt');
    expect(result.current.fileExtractionResult?.filename).toBe('second.txt');
    expect(result.current.isExtracting).toBe(false);
  });

  it('does not repopulate results when extraction completes after reset', async () => {
    const pending = deferred();
    vi.mocked(extractTextFromFile).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useFileScanner());
    let scan!: Promise<void>;
    act(() => { scan = result.current.handleFileSelected(new File([], 'sample.txt')); });
    act(() => { result.current.resetFileScanner(); });
    await act(async () => { pending.resolve(extraction('sample.txt')); await scan; });
    expect(result.current.fileExtractionResult).toBeNull();
    expect(result.current.fileScanResult).toBeNull();
    expect(result.current.isExtracting).toBe(false);
  });

  it('ignores an obsolete failure while the current file is still loading', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(extractTextFromFile).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useFileScanner());
    let firstScan!: Promise<void>;
    let secondScan!: Promise<void>;
    act(() => { firstScan = result.current.handleFileSelected(new File([], 'first.txt')); });
    act(() => { secondScan = result.current.handleFileSelected(new File([], 'second.txt')); });
    await act(async () => { first.reject(new Error('Old extraction failed')); await firstScan; });
    expect(result.current.isExtracting).toBe(true);
    await act(async () => { second.resolve(extraction('second.txt')); await secondScan; });
    expect(result.current.fileScanResult?.fileInfo.filename).toBe('second.txt');
  });
});

describe('file threats', () => {
  it('reports zero-size PDF text as hidden but leaves document scripts to the scan rules', async () => {
    const layers: FileExtractionResult['layers'] = [
      { type: 'visible', content: 'Quarterly form', location: '1 page(s)' },
      { type: 'hidden', content: 'function total() { return 1; }', location: 'PDF JavaScript' },
      { type: 'hidden', content: 'tiny words', location: 'Zero/tiny font size text' },
    ];
    vi.mocked(extractTextFromFile).mockResolvedValueOnce({
      ...extraction('form.pdf'), fileType: 'pdf', mimeType: 'application/pdf', layers,
      allText: layers.map(layer => layer.content).join('\n'),
    });
    const { result } = renderHook(() => useFileScanner());
    await act(async () => { await result.current.handleFileSelected(new File([], 'form.pdf')); });
    expect(result.current.fileScanResult?.fileThreats.map(threat => threat.location)).toEqual(['Zero/tiny font size text']);
  });
});
