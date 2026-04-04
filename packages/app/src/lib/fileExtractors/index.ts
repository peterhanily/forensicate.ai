import type { FileExtractionResult } from '@forensicate/scanner';
import { detectFileType, MAX_FILE_SIZE, formatFileSize } from './utils';

export { detectFileType, MAX_FILE_SIZE, formatFileSize } from './utils';
export { detectZeroWidthChars } from './utils';

/**
 * Extract text from a file, detecting hidden content and metadata.
 * Heavy libraries (pdfjs-dist, etc.) are lazy-loaded on first use.
 */
export async function extractTextFromFile(file: File): Promise<FileExtractionResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${formatFileSize(file.size)} (max ${formatFileSize(MAX_FILE_SIZE)})`);
  }

  const fileType = detectFileType(file);
  if (!fileType) {
    throw new Error(`Unsupported file type: ${file.type || file.name.split('.').pop()}`);
  }

  switch (fileType) {
    case 'pdf': {
      const { extractFromPDF } = await import('./pdfExtractor');
      return extractFromPDF(file);
    }
    case 'csv': {
      const { extractFromCSV } = await import('./csvExtractor');
      return extractFromCSV(file);
    }
    case 'html': {
      const { extractFromHTMLDom } = await import('./htmlDomExtractor');
      return extractFromHTMLDom(file);
    }
    case 'text': {
      const { extractFromText } = await import('./textExtractor');
      return extractFromText(file);
    }
    case 'svg': {
      const { extractFromSVG } = await import('./svgExtractor');
      return extractFromSVG(file);
    }
    case 'eml': {
      const { extractFromEml } = await import('./emlExtractor');
      return extractFromEml(file);
    }
    case 'image': {
      const { extractFromImage } = await import('./imageExtractor');
      return extractFromImage(file);
    }
    case 'docx': {
      const { extractFromDOCX } = await import('./docxExtractor');
      return extractFromDOCX(file);
    }
    case 'audio': {
      const { extractFromAudio } = await import('./audioExtractor');
      return extractFromAudio(file);
    }
    case 'video': {
      const { extractFromVideo } = await import('./videoExtractor');
      return extractFromVideo(file);
    }
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
