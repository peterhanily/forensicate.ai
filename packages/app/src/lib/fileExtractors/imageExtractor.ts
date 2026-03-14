import type { TextLayer, FileExtractionResult } from '@forensicate/scanner';
import { buildExtractionResult } from './utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exifr: any = null;

async function loadExifr() {
  if (exifr) return exifr;
  const mod = await import('exifr');
  exifr = mod.default || mod;
  return exifr;
}

// EXIF/IPTC/XMP fields that may contain text-based injection payloads
const TEXT_FIELDS = [
  'ImageDescription', 'UserComment', 'XPComment', 'XPTitle', 'XPSubject',
  'XPKeywords', 'XPAuthor', 'Artist', 'Copyright', 'Make', 'Model',
  'Software', 'DocumentName',
  // IPTC
  'caption', 'headline', 'credit', 'source', 'keywords',
  'ObjectName', 'Category', 'SpecialInstructions',
  // XMP
  'description', 'title', 'subject', 'creator', 'rights',
];

/**
 * Extract text metadata from image files (JPEG, PNG, TIFF, WebP).
 * Uses exifr to parse EXIF, IPTC, and XMP metadata.
 * Note: No OCR is performed — this is metadata-only analysis.
 */
export async function extractFromImage(file: File): Promise<FileExtractionResult> {
  const startTime = performance.now();
  const layers: TextLayer[] = [];
  const warnings: string[] = [];

  warnings.push('No OCR performed — metadata analysis only');

  try {
    const parser = await loadExifr();
    const arrayBuffer = await file.arrayBuffer();

    // Parse all available metadata
    const metadata = await parser.parse(arrayBuffer, {
      // Enable all tag groups
      tiff: true,
      exif: true,
      gps: false, // Skip GPS for privacy
      iptc: true,
      xmp: true,
      icc: false, // Skip ICC profiles
    });

    if (metadata) {
      const textEntries: string[] = [];

      for (const field of TEXT_FIELDS) {
        const value = metadata[field];
        if (value && typeof value === 'string' && value.trim()) {
          textEntries.push(`${field}: ${value.trim()}`);
        } else if (value && Array.isArray(value)) {
          const joined = value.filter((v: unknown) => typeof v === 'string').join(', ');
          if (joined) textEntries.push(`${field}: ${joined}`);
        }
      }

      if (textEntries.length > 0) {
        layers.push({
          type: 'metadata',
          content: textEntries.join('\n'),
          location: 'Image EXIF/IPTC/XMP metadata',
        });
      } else {
        warnings.push('No text-bearing metadata fields found');
      }
    } else {
      warnings.push('No EXIF/IPTC/XMP metadata found in image');
    }
  } catch {
    warnings.push('Could not parse image metadata — file may not contain EXIF data');
  }

  return buildExtractionResult(file, 'image', layers, startTime, warnings);
}
