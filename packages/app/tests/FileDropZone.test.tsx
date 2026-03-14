import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FileDropZone from '../src/components/FileDropZone';

describe('FileDropZone', () => {
  const mockOnFileSelected = vi.fn();

  beforeEach(() => {
    mockOnFileSelected.mockClear();
  });

  it('renders the drop zone with instructions', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    expect(screen.getByText(/drop a file here or click to browse/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF, DOCX, TXT, CSV, HTML, SVG, EML, Images, JSON, XML/i)).toBeInTheDocument();
  });

  it('renders the file_input header', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    expect(screen.getByText('file_input')).toBeInTheDocument();
  });

  it('shows processing state with spinner', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={true} progress="Extracting text..." />);

    expect(screen.getByText('Extracting text...')).toBeInTheDocument();
  });

  it('shows custom progress message', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={true} progress="Scanning page 2 of 5..." />);

    expect(screen.getByText('Scanning page 2 of 5...')).toBeInTheDocument();
  });

  it('accepts text files via file input change', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(mockOnFileSelected).toHaveBeenCalledWith(file);
  });

  it('rejects files that are too large', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(bigFile, 'size', { value: 51 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(mockOnFileSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/file too large/i)).toBeInTheDocument();
  });

  it('rejects unsupported file types', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const zipFile = new File(['x'], 'archive.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [zipFile] } });

    expect(mockOnFileSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
  });

  it('shows file info after selection', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'report.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('report.csv')).toBeInTheDocument();
  });

  it('handles drag and drop', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const dropZone = screen.getByText(/drop a file here/i).closest('div[class*="cursor-pointer"]')!;

    const file = new File(['csv data'], 'data.csv', { type: 'text/csv' });

    fireEvent.dragOver(dropZone, {
      dataTransfer: { files: [file] },
    });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(mockOnFileSelected).toHaveBeenCalledWith(file);
  });

  it('shows clear button when file is selected and not processing', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('clear')).toBeInTheDocument();
  });

  it('accepts image files for metadata analysis', () => {
    render(<FileDropZone onFileSelected={mockOnFileSelected} isProcessing={false} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const imgFile = new File(['fake'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [imgFile] } });

    expect(mockOnFileSelected).toHaveBeenCalledWith(imgFile);
  });
});
