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
