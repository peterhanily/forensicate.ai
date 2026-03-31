// Scanner types and interfaces

export type RuleType = 'keyword' | 'regex' | 'heuristic' | 'encoding' | 'structural';

export type RuleSeverity = 'low' | 'medium' | 'high' | 'critical';

// OWASP LLM Top 10 (2025) categories
export type OwaspLlmCategory =
  | 'LLM01' // Prompt Injection
  | 'LLM02' // Sensitive Information Disclosure
  | 'LLM03' // Supply Chain
  | 'LLM04' // Data and Model Poisoning
  | 'LLM05' // Improper Output Handling
  | 'LLM06' // Excessive Agency
  | 'LLM07' // System Prompt Leakage
  | 'LLM08' // Vector and Embedding Weaknesses
  | 'LLM09' // Misinformation
  | 'LLM10'; // Unbounded Consumption

// OWASP Agentic AI Top 10 (2026) categories
export type OwaspAgenticCategory =
  | 'ASI01' // Agent Goal Hijack
  | 'ASI02' // Agent Tool Misuse
  | 'ASI03' // Privilege Escalation via Agent
  | 'ASI04' // Agent Memory Poisoning
  | 'ASI05' // Cross-Agent Injection
  | 'ASI06' // Agent Identity Spoofing
  | 'ASI07' // Agent Resource Abuse
  | 'ASI08' // Supply Chain Poisoning (Agentic)
  | 'ASI09' // Agent Observation Leak
  | 'ASI10'; // Multi-Agent Consensus Manipulation

// Promptware Kill Chain stages (Kang et al., 2026)
export type KillChainStage =
  | 'initial-access'        // Entry point: prompt injection, indirect injection, tool poisoning
  | 'privilege-escalation'  // Elevating permissions: jailbreak, safety bypass, role hijack
  | 'reconnaissance'        // Probing: system prompt extraction, alignment testing, capability mapping
  | 'persistence'           // Maintaining access: memory poisoning, config injection, delayed triggers
  | 'command-and-control'   // Establishing C2: log-to-leak, silent monitoring, covert channels
  | 'lateral-movement'      // Spreading: cross-agent injection, worm propagation, tool chaining
  | 'exfiltration';         // Data theft: markdown exfil, credential access, data transmission

// MITRE ATLAS technique IDs (v5.4, Feb 2026)
export type MitreAtlasCategory =
  | 'AML.T0051'      // LLM Prompt Injection
  | 'AML.T0051.000'  // Direct Prompt Injection
  | 'AML.T0051.001'  // Indirect Prompt Injection
  | 'AML.T0054'      // LLM Jailbreak
  | 'AML.T0056'      // LLM Meta Prompt Extraction
  | 'AML.T0057'      // LLM Data Leakage
  | 'AML.T0043'      // Craft Adversarial Data
  | 'AML.T0040'      // ML Model Inference API Access
  | 'AML.T0044'      // Full ML Model Access
  | 'AML.T0048'      // Publish Poisoned Data
  | 'AML.T0048.004'  // Publish Poisoned AI Agent Tool
  | 'AML.T0049'      // Exploit Public-Facing Application
  | 'AML.T0050'      // Command and Control via AI Agent
  | 'AML.T0052'      // Phishing via AI
  | 'AML.T0053'      // Evade ML Model
  | 'AML.T0055'      // Unsafe Exposure of AI Agent Capabilities
  | 'AML.T0058'      // Escape to Host
  | 'AML.T0059';     // Poison AI Agent Memory

// EU AI Act risk classification
export type EuAiActRisk =
  | 'unacceptable'  // Banned: social scoring, real-time biometric surveillance
  | 'high'          // Requires conformity assessment: safety-critical, fundamental rights
  | 'limited'       // Transparency obligations: chatbots, deepfakes
  | 'minimal';      // No specific obligations

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
  // OWASP risk mapping
  owaspLlm?: OwaspLlmCategory[];
  owaspAgentic?: OwaspAgenticCategory[];
  // Forensic framework mappings
  killChain?: KillChainStage[];
  mitreAtlas?: MitreAtlasCategory[];
  euAiActRisk?: EuAiActRisk;
  // Custom section marker
  isCustom?: boolean;
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
