// Attack Complexity Score (ACS)
// Computes a 4-axis threat profile from scan results:
//   Sophistication — how technically advanced the attack is
//   Blast Radius   — potential scope of damage if the attack succeeds
//   Stealth        — how hard the attack is to detect (evasion effort)
//   Reversibility  — how easy it is to recover from a successful attack

import type { RuleMatch, CompoundThreat, KillChainStage } from './types.js';
import { inferCategoriesFromRules } from './ruleCategories.js';

export interface AttackComplexityScore {
  sophistication: number;  // 0-100
  blastRadius: number;     // 0-100
  stealth: number;         // 0-100
  reversibility: number;   // 0-100 (higher = harder to reverse)
  overall: number;         // 0-100 weighted composite
  label: AttackComplexityLabel;
}

export type AttackComplexityLabel =
  | 'trivial'      // 0-20
  | 'basic'        // 21-40
  | 'intermediate' // 41-60
  | 'advanced'     // 61-80
  | 'expert';      // 81-100

// --- Axis computation helpers ---

// Category → sophistication contribution
const SOPHISTICATION_WEIGHTS: Record<string, number> = {
  // Low sophistication: simple keyword/instruction attacks
  'instruction-override': 10,
  'compliance-forcing': 10,
  'threats-consequences': 10,
  'persuasion': 15,
  // Medium sophistication: require knowledge of LLM internals
  'jailbreak': 30,
  'role-manipulation': 25,
  'safety-removal': 25,
  'prompt-extraction': 30,
  'authority-developer': 20,
  'context-manipulation': 25,
  'fiction-hypothetical': 20,
  // High sophistication: advanced techniques
  'encoding-obfuscation': 50,
  'structural': 40,
  'mcp-agent-security': 55,
  'exfiltration-supply-chain': 50,
  'ide-supply-chain': 55,
  'worm-propagation': 60,
  'rag-security': 45,
  'temporal-conditional': 50,
  'output-forensics': 35,
};

// Category → blast radius contribution
const BLAST_RADIUS_WEIGHTS: Record<string, number> = {
  'instruction-override': 20,
  'jailbreak': 30,
  'safety-removal': 35,
  'prompt-extraction': 25,
  'exfiltration-supply-chain': 60,
  'worm-propagation': 70,
  'mcp-agent-security': 55,
  'ide-supply-chain': 50,
  'rag-security': 45,
  'role-manipulation': 15,
  'compliance-forcing': 15,
  'authority-developer': 20,
  'context-manipulation': 20,
  'temporal-conditional': 40,
  'output-forensics': 30,
  'encoding-obfuscation': 15,
  'structural': 15,
  'fiction-hypothetical': 10,
  'persuasion': 10,
  'threats-consequences': 10,
};

// Category → stealth contribution
const STEALTH_WEIGHTS: Record<string, number> = {
  'encoding-obfuscation': 60,
  'fiction-hypothetical': 40,
  'context-manipulation': 35,
  'structural': 30,
  'temporal-conditional': 50,
  'rag-security': 40,
  'ide-supply-chain': 45,
  'persuasion': 30,
  // Loud/obvious attacks score low on stealth
  'jailbreak': 10,
  'instruction-override': 5,
  'compliance-forcing': 10,
  'safety-removal': 10,
  'threats-consequences': 5,
  'authority-developer': 15,
  'role-manipulation': 20,
  'prompt-extraction': 20,
  'mcp-agent-security': 30,
  'exfiltration-supply-chain': 35,
  'worm-propagation': 25,
  'output-forensics': 15,
};

// Category → irreversibility contribution
const REVERSIBILITY_WEIGHTS: Record<string, number> = {
  'worm-propagation': 70,
  'exfiltration-supply-chain': 65,
  'rag-security': 50,
  'temporal-conditional': 55,
  'mcp-agent-security': 45,
  'ide-supply-chain': 50,
  'prompt-extraction': 40,
  'safety-removal': 30,
  'jailbreak': 25,
  'instruction-override': 15,
  'role-manipulation': 15,
  'context-manipulation': 20,
  'authority-developer': 15,
  'encoding-obfuscation': 20,
  'structural': 15,
  'compliance-forcing': 10,
  'fiction-hypothetical': 10,
  'persuasion': 10,
  'threats-consequences': 10,
  'output-forensics': 35,
};

// Kill chain coverage adds to sophistication and blast radius
const KILL_CHAIN_ORDER: KillChainStage[] = [
  'initial-access',
  'privilege-escalation',
  'reconnaissance',
  'persistence',
  'command-and-control',
  'lateral-movement',
  'exfiltration',
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeAxisScore(
  matchedCategories: Set<string>,
  weights: Record<string, number>,
  matchedRules: RuleMatch[],
): number {
  let score = 0;
  for (const cat of matchedCategories) {
    score += weights[cat] ?? 0;
  }

  // Severity multiplier: critical matches boost all axes
  const criticalCount = matchedRules.filter(r => r.severity === 'critical').length;
  const highCount = matchedRules.filter(r => r.severity === 'high').length;
  if (criticalCount > 0) score *= 1 + criticalCount * 0.1;
  if (highCount >= 3) score *= 1.1;

  return clamp(score);
}

/**
 * Compute the 4-axis Attack Complexity Score from scan results.
 */
export function computeAttackComplexity(
  matchedRules: RuleMatch[],
  compoundThreats?: CompoundThreat[],
): AttackComplexityScore | null {
  if (matchedRules.length === 0) return null;

  // Derive matched categories from rule IDs
  // Rule IDs use prefixes like "kw-", "rx-", "heur-" followed by category-related names,
  // but compound threats and the category structure are what we need.
  // We use rule category IDs which are the last entries in rules.ts (no prefix).
  // Since we don't have direct category mapping on RuleMatch, we infer from rule ID prefixes.
  const matchedCategories = inferCategories(matchedRules);

  // Compute each axis
  let sophistication = computeAxisScore(matchedCategories, SOPHISTICATION_WEIGHTS, matchedRules);
  let blastRadius = computeAxisScore(matchedCategories, BLAST_RADIUS_WEIGHTS, matchedRules);
  let stealth = computeAxisScore(matchedCategories, STEALTH_WEIGHTS, matchedRules);
  let reversibility = computeAxisScore(matchedCategories, REVERSIBILITY_WEIGHTS, matchedRules);

  // Kill chain coverage bonus: spanning multiple stages = more sophisticated
  const killChainStages = new Set(matchedRules.flatMap(r => r.killChain ?? []));
  const killChainCoverage = killChainStages.size / KILL_CHAIN_ORDER.length;
  if (killChainCoverage > 0.3) {
    sophistication = clamp(sophistication + killChainCoverage * 20);
    blastRadius = clamp(blastRadius + killChainCoverage * 15);
  }
  // Late-stage kill chain = harder to reverse
  if (killChainStages.has('exfiltration') || killChainStages.has('lateral-movement')) {
    reversibility = clamp(reversibility + 15);
  }
  if (killChainStages.has('persistence')) {
    reversibility = clamp(reversibility + 10);
  }

  // Compound threats = more sophisticated and wider blast
  const compoundCount = compoundThreats?.length ?? 0;
  if (compoundCount > 0) {
    sophistication = clamp(sophistication + compoundCount * 10);
    blastRadius = clamp(blastRadius + compoundCount * 8);
  }

  // Multi-technique bonus: using many different rule types
  const ruleTypes = new Set(matchedRules.map(r => r.ruleType));
  if (ruleTypes.size >= 3) {
    sophistication = clamp(sophistication + 10);
    stealth = clamp(stealth + 5);
  }

  // Weighted composite
  const overall = clamp(
    sophistication * 0.30 +
    blastRadius * 0.30 +
    stealth * 0.20 +
    reversibility * 0.20
  );

  const label = getLabel(overall);

  return { sophistication, blastRadius, stealth, reversibility, overall, label };
}

function getLabel(overall: number): AttackComplexityLabel {
  if (overall <= 20) return 'trivial';
  if (overall <= 40) return 'basic';
  if (overall <= 60) return 'intermediate';
  if (overall <= 80) return 'advanced';
  return 'expert';
}

function inferCategories(matchedRules: RuleMatch[]): Set<string> {
  const categories = inferCategoriesFromRules(matchedRules.map(r => r.ruleId));

  // Fallback: derive from kill chain for rules that didn't match any prefix
  for (const rule of matchedRules) {
    if (rule.killChain && !inferCategoriesFromRules([rule.ruleId]).size) {
      if (rule.killChain.includes('exfiltration')) categories.add('exfiltration-supply-chain');
      if (rule.killChain.includes('lateral-movement')) categories.add('worm-propagation');
      if (rule.killChain.includes('persistence')) categories.add('temporal-conditional');
      if (rule.killChain.includes('initial-access')) categories.add('instruction-override');
    }
  }

  return categories;
}

/**
 * Get a human-readable description of the attack complexity.
 */
export function getComplexityDescription(score: AttackComplexityScore): string {
  const descriptions: Record<AttackComplexityLabel, string> = {
    trivial: 'Simple, well-known attack pattern. Easily blocked by basic guardrails.',
    basic: 'Common attack technique requiring minimal LLM knowledge. Standard defenses should catch this.',
    intermediate: 'Moderately sophisticated attack combining multiple techniques. Requires targeted defenses.',
    advanced: 'Highly sophisticated attack using advanced evasion or multi-vector approach. Specialized countermeasures needed.',
    expert: 'Expert-level attack with maximum stealth, blast radius, or persistence. Requires defense-in-depth strategy.',
  };
  return descriptions[score.label];
}
