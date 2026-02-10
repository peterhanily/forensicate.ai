/**
 * Red Team AI - Adversarial Testing System
 *
 * Automatically generates novel attacks to discover detection blind spots
 * and suggests rule improvements.
 */

export interface RedTeamConfig {
  // Provider to use for attack generation
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  apiKey?: string;

  // Test configuration
  attacksPerRun: number; // Number of attacks to generate (default: 10)
  techniques: AttackTechnique[]; // Which techniques to use
  targetCategories?: string[]; // Specific categories to test (or all)

  // Thresholds
  bypassThreshold: number; // Confidence score below which = successful bypass (default: 50)
  minNovelty: number; // Similarity threshold to avoid duplicates (0-1)
}

export type AttackTechnique =
  | 'paraphrasing'           // Rephrase known attacks
  | 'encoding'               // Base64, ROT13, Unicode, etc.
  | 'multi-turn'             // Split attack across conversation
  | 'social-engineering'     // Authority claims, urgency
  | 'hypothetical-framing'   // "What if", "Imagine if"
  | 'translation'            // Multi-language attacks
  | 'token-smuggling'        // Hidden instructions in unusual formats
  | 'context-manipulation'   // Instruction override techniques
  | 'role-confusion'         // Persona/character attacks
  | 'compound'               // Combine multiple techniques

export interface GeneratedAttack {
  id: string;
  promptText: string;
  technique: AttackTechnique;
  targetCategory: string;
  rationale: string; // Why this attack might bypass detection
  basedOn?: string; // ID of attack this is derived from (if any)
  timestamp: string;
}

export interface RedTeamResult {
  attack: GeneratedAttack;
  scanResult: {
    confidenceScore: number;
    matchedRules: number;
    highestSeverity: string;
    categories: string[];
  };
  bypassedDetection: boolean; // True if confidence < threshold
  reasoning: string; // Analysis of why it bypassed (or didn't)
}

export interface RedTeamRun {
  id: string;
  timestamp: string;
  config: RedTeamConfig;

  // Results
  totalAttacks: number;
  successfulBypasses: number;
  bypassRate: number; // Percentage
  results: RedTeamResult[];

  // Analysis
  vulnerableCategories: string[]; // Categories with high bypass rates
  weakRules: string[]; // Rules that were frequently bypassed
  suggestedRules: SuggestedRule[];

  // Performance
  duration: number; // ms
  cost: number; // Estimated API cost
}

export interface SuggestedRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'keyword' | 'regex' | 'heuristic';

  // Rule definition (varies by type)
  keywords?: string[];
  pattern?: string;
  heuristicLogic?: string; // Human-readable description

  // Evidence
  catchesAttacks: string[]; // IDs of attacks this would catch
  confidence: number; // How confident we are this is useful (0-100)
  rationale: string; // Why this rule is needed

  // User feedback
  approved?: boolean;
  userNotes?: string;
}

export interface VulnerabilityReport {
  runId: string;
  timestamp: string;

  // Summary metrics
  overallVulnerabilityScore: number; // 0-100, lower = better
  bypassRate: number;
  coverageGaps: string[]; // Categories with no/weak detection

  // Detailed findings
  criticalFindings: RedTeamResult[]; // High-severity bypasses
  patternAnalysis: {
    technique: AttackTechnique;
    bypassRate: number;
    exampleAttacks: string[];
  }[];

  // Recommendations
  priorityActions: {
    priority: 'critical' | 'high' | 'medium';
    action: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
  }[];

  suggestedRules: SuggestedRule[];
}

export interface RedTeamHistory {
  runs: RedTeamRun[];
  trends: {
    date: string;
    vulnerabilityScore: number;
    bypassRate: number;
  }[];
}
