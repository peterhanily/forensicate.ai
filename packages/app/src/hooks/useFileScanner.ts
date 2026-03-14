import { useState, useCallback } from 'react';
import type {
  FileExtractionResult,
  FileScanResult,
  FileThreat,
  ScanResult,
  DetectionRule,
  RuleSeverity,
} from '@forensicate/scanner';
import { scanPrompt } from '@forensicate/scanner';
import { extractTextFromFile } from '../lib/fileExtractors';

export type ScanMode = 'text_input' | 'file_scan';

interface UseFileScannerReturn {
  scanMode: ScanMode;
  setScanMode: (mode: ScanMode) => void;
  fileExtractionResult: FileExtractionResult | null;
  fileScanResult: FileScanResult | null;
  isExtracting: boolean;
  extractionProgress: string;
  handleFileSelected: (file: File, customRules?: DetectionRule[], confidenceThreshold?: number) => Promise<void>;
  resetFileScanner: () => void;
}

/**
 * Analyze file extraction result for file-specific threats
 * (hidden text, metadata injection, invisible unicode, off-page content)
 */
function detectFileThreats(extraction: FileExtractionResult): FileThreat[] {
  const threats: FileThreat[] = [];

  for (const layer of extraction.layers) {
    if (layer.type === 'hidden') {
      threats.push({
        type: 'hidden-text',
        severity: 'critical' as RuleSeverity,
        description: `Hidden text detected with zero/tiny font size containing ${layer.content.split(/\s+/).length} words`,
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'off-page') {
      threats.push({
        type: 'off-page-content',
        severity: 'high' as RuleSeverity,
        description: 'Text positioned outside the visible page area',
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'invisible-unicode') {
      threats.push({
        type: 'invisible-unicode',
        severity: 'high' as RuleSeverity,
        description: 'Invisible unicode characters detected (possible text smuggling)',
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'metadata' || layer.type === 'doc-property') {
      // Check if metadata contains injection-like patterns
      const injectionPatterns = [
        /ignore\s+(all\s+)?(previous\s+)?instructions/i,
        /system\s*:\s*/i,
        /you\s+are\s+(now|a)\s+/i,
        /override|bypass|reveal|extract/i,
      ];
      const hasInjection = injectionPatterns.some(p => p.test(layer.content));
      if (hasInjection) {
        threats.push({
          type: 'metadata-injection',
          severity: 'high' as RuleSeverity,
          description: 'Document metadata contains injection-like patterns',
          content: layer.content,
          location: layer.location,
        });
      }
    }

    if (layer.type === 'tracked-change') {
      threats.push({
        type: 'tracked-change-injection',
        severity: 'critical' as RuleSeverity,
        description: `Tracked changes contain ${layer.content.split(/\s+/).length} word(s) — may hide injections in revision history`,
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'vanish-text') {
      threats.push({
        type: 'vanish-text-injection',
        severity: 'critical' as RuleSeverity,
        description: `Hidden vanish text with ${layer.content.split(/\s+/).length} word(s) — invisible to users but extracted by AI`,
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'custom-xml') {
      threats.push({
        type: 'custom-xml-injection',
        severity: 'high' as RuleSeverity,
        description: 'Custom XML parts may contain hidden injection payloads',
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'comment') {
      threats.push({
        type: 'hidden-text',
        severity: 'high' as RuleSeverity,
        description: `Document comments contain ${layer.content.split(/\s+/).length} word(s) — often ignored by users but seen by AI`,
        content: layer.content,
        location: layer.location,
      });
    }

    if (layer.type === 'low-contrast') {
      threats.push({
        type: 'low-contrast',
        severity: 'high' as RuleSeverity,
        description: 'Low-contrast text detected — visually invisible but machine-readable',
        content: layer.content,
        location: layer.location,
      });
    }
  }

  return threats;
}

export function useFileScanner(): UseFileScannerReturn {
  const [scanMode, setScanMode] = useState<ScanMode>('text_input');
  const [fileExtractionResult, setFileExtractionResult] = useState<FileExtractionResult | null>(null);
  const [fileScanResult, setFileScanResult] = useState<FileScanResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState('');

  const handleFileSelected = useCallback(async (
    file: File,
    customRules?: DetectionRule[],
    confidenceThreshold?: number,
  ) => {
    setIsExtracting(true);
    setExtractionProgress('Extracting text...');
    setFileScanResult(null);

    try {
      // Extract text from file
      const extraction = await extractTextFromFile(file);
      setFileExtractionResult(extraction);
      setExtractionProgress('Scanning extracted text...');

      // Scan all extracted text (visible + hidden combined)
      const allResult = scanPrompt(extraction.allText, customRules, confidenceThreshold);

      // Scan visible text only
      const visibleResult = scanPrompt(extraction.visibleText, customRules, confidenceThreshold);

      // Scan hidden text if present
      let hiddenResult: ScanResult | undefined;
      if (extraction.hiddenText.trim()) {
        hiddenResult = scanPrompt(extraction.hiddenText, customRules, confidenceThreshold);
      }

      // Detect file-specific threats
      const fileThreats = detectFileThreats(extraction);

      // Build the FileScanResult (extends ScanResult with file info)
      const result: FileScanResult = {
        ...allResult,
        // Boost confidence if file-specific threats are found
        confidence: Math.min(
          allResult.confidence + fileThreats.length * 10,
          100,
        ),
        isPositive: allResult.isPositive || fileThreats.length > 0,
        fileInfo: extraction,
        visibleScanResult: visibleResult,
        hiddenScanResult: hiddenResult,
        fileThreats,
      };

      setFileScanResult(result);
    } catch (error) {
      setFileExtractionResult(null);
      throw error;
    } finally {
      setIsExtracting(false);
      setExtractionProgress('');
    }
  }, []);

  const resetFileScanner = useCallback(() => {
    setFileExtractionResult(null);
    setFileScanResult(null);
    setIsExtracting(false);
    setExtractionProgress('');
  }, []);

  return {
    scanMode,
    setScanMode,
    fileExtractionResult,
    fileScanResult,
    isExtracting,
    extractionProgress,
    handleFileSelected,
    resetFileScanner,
  };
}
