// Scanner types and interfaces

export type RuleType = 'keyword' | 'regex' | 'heuristic' | 'encoding' | 'structural';

export type RuleSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  type: RuleType;
  severity: RuleSeverity;
  enabled: boolean;
  // For keyword rules
  keywords?: string[];
  // For regex rules
  pattern?: string;
  flags?: string;
  // For heuristic rules
  heuristic?: (text: string) => HeuristicResult | null;
  // Optional manual confidence weight (overrides severity-based weight)
  weight?: number;
}

export interface HeuristicResult {
  matched: boolean;
  details?: string;
  confidence?: number;
}

export interface MatchPosition {
  start: number;
  end: number;
  text: string;
  line: number;
  column: number;
}

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  severity: RuleSeverity;
  matches: string[];
  positions: Array<{ start: number; end: number }>;
  // Enhanced position data with line/column info for annotation UI
  matchPositions?: MatchPosition[];
  details?: string;
  // Per-rule confidence impact (points contributed to total score)
  confidenceImpact?: number;
  // Effective weight used for this rule (from rule.weight or SEVERITY_WEIGHTS)
  weight?: number;
}

export interface CompoundThreat {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  triggeredCategories: string[];
}

export interface ScanResult {
  isPositive: boolean;
  confidence: number;
  reasons: string[];
  timestamp: Date;
  matchedRules: RuleMatch[];
  totalRulesChecked: number;
  compoundThreats?: CompoundThreat[];
}

export interface RuleCategory {
  id: string;
  name: string;
  description: string;
  rules: DetectionRule[];
  isCustom?: boolean;
  source?: string; // Citation/source for experimental rules
}

// UI type for rendering annotated segments
export interface AnnotatedSegment {
  start: number;
  end: number;
  text: string;
  rules: RuleMatch[];
}

// ============================================================================
// FILE SCANNING TYPES
// ============================================================================

export type FileType = 'pdf' | 'image' | 'docx' | 'csv' | 'html' | 'text' | 'svg' | 'eml';

export type TextLayerType =
  | 'visible' | 'hidden' | 'metadata' | 'comment'
  | 'low-contrast' | 'invisible-unicode' | 'ocr' | 'off-page'
  | 'tracked-change' | 'vanish-text' | 'header-footer' | 'custom-xml' | 'doc-property';

export interface TextLayer {
  type: TextLayerType;
  content: string;
  location: string;
  extractionConfidence?: number;
}

export interface FileExtractionResult {
  filename: string;
  fileSize: number;
  fileType: FileType;
  mimeType: string;
  layers: TextLayer[];
  visibleText: string;
  hiddenText: string;
  allText: string;
  extractionTimeMs: number;
  warnings: string[];
  pageCount?: number;
}

export interface FileScanResult extends ScanResult {
  fileInfo: FileExtractionResult;
  visibleScanResult: ScanResult;
  hiddenScanResult?: ScanResult;
  fileThreats: FileThreat[];
}

export interface FileThreat {
  type: 'hidden-text' | 'metadata-injection' | 'invisible-unicode'
    | 'low-contrast' | 'steganographic' | 'off-page-content'
    | 'tracked-change-injection' | 'vanish-text-injection' | 'custom-xml-injection'
    | 'html-hidden-injection' | 'svg-hidden-injection' | 'bidi-override';
  severity: RuleSeverity;
  description: string;
  content: string;
  location: string;
}
