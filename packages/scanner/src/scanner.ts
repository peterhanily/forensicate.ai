// Prompt Injection Scanner Engine
// Executes detection rules and generates scan results

import type { DetectionRule, RuleMatch, ScanResult, MatchPosition } from './types';
import { getEnabledRules } from './rules';
import { detectCompoundThreats } from './compoundDetector';

// Severity weights for confidence calculation
export const SEVERITY_WEIGHTS = {
  low: 10,
  medium: 25,
  high: 40,
  critical: 60,
};

/**
 * Convert character index to line and column number
 */
function getLineColumn(text: string, index: number): { line: number; column: number } {
  const beforeText = text.substring(0, index);
  const line = (beforeText.match(/\n/g) || []).length + 1;
  const lastNewline = beforeText.lastIndexOf('\n');
  const column = index - lastNewline;
  return { line, column };
}

/**
 * Convert basic positions array to enhanced MatchPosition array
 */
function enhancePositions(
  text: string,
  positions: Array<{ start: number; end: number }>
): MatchPosition[] {
  return positions.map(pos => {
    const { line, column } = getLineColumn(text, pos.start);
    return {
      start: pos.start,
      end: pos.end,
      text: text.substring(pos.start, pos.end),
      line,
      column,
    };
  });
}

/**
 * Scans text for keyword matches (case-insensitive)
 */
function scanKeywords(text: string, rule: DetectionRule): RuleMatch | null {
  if (!rule.keywords || rule.keywords.length === 0) return null;

  const lowerText = text.toLowerCase();
  const matches: string[] = [];
  const positions: Array<{ start: number; end: number }> = [];

  for (const keyword of rule.keywords) {
    const lowerKeyword = keyword.toLowerCase();
    let searchIndex = 0;

    while (true) {
      const foundIndex = lowerText.indexOf(lowerKeyword, searchIndex);
      if (foundIndex === -1) break;

      // Get the actual text that matched (preserving case)
      const matchedText = text.slice(foundIndex, foundIndex + keyword.length);
      matches.push(matchedText);
      positions.push({ start: foundIndex, end: foundIndex + keyword.length });

      searchIndex = foundIndex + 1;
    }
  }

  if (matches.length === 0) return null;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    ruleType: rule.type,
    severity: rule.severity,
    matches,
    positions,
    matchPositions: enhancePositions(text, positions),
  };
}

/**
 * Scans text for regex pattern matches
 */
function scanRegex(text: string, rule: DetectionRule): RuleMatch | null {
  if (!rule.pattern) return null;

  try {
    const regex = new RegExp(rule.pattern, rule.flags || 'gi');
    const matches: string[] = [];
    const positions: Array<{ start: number; end: number }> = [];

    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[0]);
      positions.push({ start: match.index, end: match.index + match[0].length });

      // Prevent infinite loop for zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    if (matches.length === 0) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      severity: rule.severity,
      matches,
      positions,
      matchPositions: enhancePositions(text, positions),
    };
  } catch (error) {
    console.error(`Invalid regex pattern in rule ${rule.id}:`, error);
    return null;
  }
}

/**
 * Executes heuristic function and returns match
 */
function scanHeuristic(text: string, rule: DetectionRule): RuleMatch | null {
  if (!rule.heuristic) return null;

  try {
    const result = rule.heuristic(text);
    if (!result || !result.matched) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      severity: rule.severity,
      matches: [],
      positions: [],
      details: result.details,
    };
  } catch (error) {
    console.error(`Heuristic error in rule ${rule.id}:`, error);
    return null;
  }
}

/**
 * Execute a single rule against text
 */
function executeRule(text: string, rule: DetectionRule): RuleMatch | null {
  switch (rule.type) {
    case 'keyword':
      return scanKeywords(text, rule);
    case 'regex':
    case 'encoding':
    case 'structural':
      return scanRegex(text, rule);
    case 'heuristic':
      return scanHeuristic(text, rule);
    default:
      return null;
  }
}

/**
 * Calculate confidence score based on matched rules
 */
function calculateConfidence(matchedRules: RuleMatch[]): number {
  if (matchedRules.length === 0) return 0;

  let totalScore = 0;

  // Count severity occurrences
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const match of matchedRules) {
    severityCounts[match.severity]++;
    // Use pre-computed confidenceImpact if available, otherwise fall back to severity weight
    totalScore += match.confidenceImpact ?? SEVERITY_WEIGHTS[match.severity];
  }

  // Critical findings heavily weight the confidence
  if (severityCounts.critical > 0) {
    totalScore += severityCounts.critical * 30;
  }

  // Multiple high severity findings increase confidence
  if (severityCounts.high >= 2) {
    totalScore += 20;
  }

  // Logarithmic scaling to prevent runaway scores
  // Cap confidence at 99% (never 100% certain)
  const confidence = Math.min(
    99,
    Math.round(50 + 50 * Math.log10(1 + totalScore / 50))
  );

  return confidence;
}

/**
 * Generate human-readable reasons from matches
 */
function generateReasons(matchedRules: RuleMatch[]): string[] {
  const reasons: string[] = [];

  // Sort by severity (critical first)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedMatches = [...matchedRules].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  for (const match of sortedMatches) {
    const severityLabel =
      match.severity === 'critical'
        ? '🔴 CRITICAL'
        : match.severity === 'high'
        ? '🟠 HIGH'
        : match.severity === 'medium'
        ? '🟡 MEDIUM'
        : '🟢 LOW';

    let reason = `[${severityLabel}] ${match.ruleName}`;

    if (match.details) {
      reason += `: ${match.details}`;
    } else if (match.matches.length > 0) {
      const displayMatches = match.matches.slice(0, 3);
      const matchText = displayMatches.map(m => `"${m.slice(0, 40)}${m.length > 40 ? '...' : ''}"`).join(', ');
      reason += `: Found ${matchText}`;
      if (match.matches.length > 3) {
        reason += ` (+${match.matches.length - 3} more)`;
      }
    }

    reasons.push(reason);
  }

  return reasons;
}

// Maximum input length to prevent excessive CPU usage from regex scanning
const MAX_SCAN_LENGTH = 1_000_000; // 1MB

/**
 * Main scan function - analyzes text against all enabled rules
 */
export function scanPrompt(text: string, customRules?: DetectionRule[], confidenceThreshold = 0): ScanResult {
  // Guard against excessively large inputs
  if (!text || typeof text !== 'string') {
    return {
      isPositive: false,
      confidence: 0,
      reasons: ['No text provided'],
      timestamp: new Date(),
      matchedRules: [],
      totalRulesChecked: 0,
    };
  }

  if (text.length > MAX_SCAN_LENGTH) {
    text = text.substring(0, MAX_SCAN_LENGTH);
  }

  const rules = customRules || getEnabledRules();
  const matchedRules: RuleMatch[] = [];

  // Execute all rules
  for (const rule of rules) {
    if (!rule.enabled) continue;

    const match = executeRule(text, rule);
    if (match) {
      // Attach per-rule weight and impact
      const effectiveWeight = rule.weight ?? SEVERITY_WEIGHTS[rule.severity];
      let impact = effectiveWeight;
      if (match.matches.length > 1) {
        impact += Math.min(match.matches.length * 5, 20);
      }
      match.weight = effectiveWeight;
      match.confidenceImpact = impact;
      matchedRules.push(match);
    }
  }

  // Calculate confidence BEFORE determining isPositive
  const confidence = calculateConfidence(matchedRules);
  const isPositive = matchedRules.length > 0 && (confidenceThreshold === 0 || confidence >= confidenceThreshold);
  const reasons = matchedRules.length > 0
    ? isPositive
      ? generateReasons(matchedRules)
      : [`${matchedRules.length} rule(s) matched but confidence ${confidence}% is below threshold ${confidenceThreshold}%`]
    : ['No injection patterns detected'];

  // Post-processing: detect compound threats
  const compoundThreats = detectCompoundThreats(matchedRules);

  return {
    isPositive,
    confidence,
    reasons,
    timestamp: new Date(),
    matchedRules,
    totalRulesChecked: rules.filter(r => r.enabled).length,
    compoundThreats: compoundThreats.length > 0 ? compoundThreats : undefined,
  };
}

/**
 * Scan with specific rule categories only
 */
export function scanWithCategories(
  text: string,
  categoryIds: string[],
  allCategories: Array<{ id: string; rules: DetectionRule[] }>
): ScanResult {
  const rules: DetectionRule[] = [];

  for (const cat of allCategories) {
    if (categoryIds.includes(cat.id)) {
      rules.push(...cat.rules.filter(r => r.enabled));
    }
  }

  return scanPrompt(text, rules);
}

/**
 * Get summary statistics about rules
 */
export function getRuleStats(rules: DetectionRule[]): {
  total: number;
  enabled: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const rule of rules) {
    byType[rule.type] = (byType[rule.type] || 0) + 1;
    bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
  }

  return {
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    byType,
    bySeverity,
  };
}
