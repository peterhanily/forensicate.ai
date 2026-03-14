import { useState, useRef, useCallback } from 'react';
import { MAX_FILE_SIZE, formatFileSize, detectFileType } from '../lib/fileExtractors';

interface FileDropZoneProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
  progress?: string;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt,.md,.csv,.json,.xml,.html,.htm,.svg,.eml,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.log,.yaml,.yml';

export default function FileDropZone({ onFileSelected, isProcessing, progress }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback((file: File) => {
    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large: ${formatFileSize(file.size)} (max ${formatFileSize(MAX_FILE_SIZE)})`);
      return;
    }

    const fileType = detectFileType(file);
    if (!fileType) {
      setError(`Unsupported file type: ${file.type || file.name.split('.').pop()}`);
      return;
    }

    setSelectedFile(file);
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }, [validateAndSelect]);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [validateAndSelect]);

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs font-mono">file_input</span>
        </div>
        {selectedFile && !isProcessing && (
          <button
            onClick={() => { setSelectedFile(null); setError(null); }}
            className="text-gray-500 hover:text-gray-300 text-xs font-mono transition-colors"
          >
            clear
          </button>
        )}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`relative cursor-pointer transition-all min-h-[192px] flex flex-col items-center justify-center p-6 ${
          isDragging
            ? 'bg-[#c9a227]/10 border-2 border-dashed border-[#c9a227]/50'
            : 'hover:bg-gray-800/30'
        }`}
        data-tour="file-input"
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-[#c9a227]" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-[#c9a227] text-sm font-mono">{progress || 'Extracting text...'}</span>
            {selectedFile && (
              <span className="text-gray-500 text-xs font-mono">{selectedFile.name}</span>
            )}
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-[#c9a227] text-2xl">
              {getFileIcon(selectedFile)}
            </div>
            <span className="text-green-400 text-sm font-mono">{selectedFile.name}</span>
            <span className="text-gray-500 text-xs font-mono">
              {formatFileSize(selectedFile.size)} · {selectedFile.type || 'unknown type'}
            </span>
            <span className="text-gray-600 text-xs font-mono mt-1">
              Drop another file or click to replace
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <div>
              <p className="text-gray-400 text-sm font-mono">
                Drop a file here or click to browse
              </p>
              <p className="text-gray-600 text-xs font-mono mt-1">
                PDF, DOCX, TXT, CSV, HTML, SVG, EML, Images, JSON, XML · Max {formatFileSize(MAX_FILE_SIZE)}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute bottom-3 left-3 right-3">
            <div className="bg-red-900/30 border border-red-800/50 rounded px-3 py-2 text-red-400 text-xs font-mono">
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getFileIcon(file: File): string {
  const type = detectFileType(file);
  switch (type) {
    case 'pdf': return '\u{1F4C4}';
    case 'docx': return '\u{1F4C4}';
    case 'csv': return '\u{1F4CA}';
    case 'html': return '\u{1F310}';
    case 'svg': return '\u{1F5BC}';
    case 'eml': return '\u{1F4E7}';
    case 'text': return '\u{1F4DD}';
    case 'image': return '\u{1F5BC}';
    default: return '\u{1F4C1}';
  }
}
