// Compound Threat Detection
// Identifies when multiple attack categories are present simultaneously,
// indicating sophisticated multi-vector attacks.

import type { RuleMatch, CompoundThreat, RuleSeverity } from './types';
import { ruleCategories } from './rules';

interface CompoundDefinition {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  requiredCategories: string[];
}

const compoundDefinitions: CompoundDefinition[] = [
  {
    id: 'compound-manipulation-chain',
    name: 'Manipulation Chain',
    description: 'Role manipulation combined with compliance forcing indicates a coordinated social engineering attack',
    severity: 'critical',
    requiredCategories: ['role-manipulation', 'compliance-forcing'],
  },
  {
    id: 'compound-extraction-attack',
    name: 'Extraction Attack',
    description: 'Context manipulation paired with prompt extraction suggests a targeted data exfiltration attempt',
    severity: 'critical',
    requiredCategories: ['context-manipulation', 'prompt-extraction'],
  },
  {
    id: 'compound-full-bypass',
    name: 'Full Bypass Attempt',
    description: 'Jailbreak techniques combined with safety removal indicates an attempt to fully disable protections',
    severity: 'critical',
    requiredCategories: ['jailbreak', 'safety-removal'],
  },
  {
    id: 'compound-authority-override',
    name: 'Authority Override',
    description: 'Authority/developer mode claims combined with instruction override suggests impersonation-based takeover',
    severity: 'high',
    requiredCategories: ['authority-developer', 'instruction-override'],
  },
  {
    id: 'compound-fiction-extraction',
    name: 'Fiction-Wrapped Extraction',
    description: 'Fiction/hypothetical framing combined with prompt extraction suggests disguised information theft',
    severity: 'high',
    requiredCategories: ['fiction-hypothetical', 'prompt-extraction'],
  },
];

/**
 * Maps matched rules back to their category IDs.
 */
function getMatchedCategories(matchedRules: RuleMatch[]): Set<string> {
  const matchedRuleIds = new Set(matchedRules.map(r => r.ruleId));
  const matchedCategories = new Set<string>();

  for (const category of ruleCategories) {
    for (const rule of category.rules) {
      if (matchedRuleIds.has(rule.id)) {
        matchedCategories.add(category.id);
        break;
      }
    }
  }

  return matchedCategories;
}

/**
 * Detects compound threats based on matched rules.
 * Run as post-processing after individual rule scanning.
 */
export function detectCompoundThreats(matchedRules: RuleMatch[]): CompoundThreat[] {
  if (matchedRules.length === 0) return [];

  const matchedCategories = getMatchedCategories(matchedRules);
  const threats: CompoundThreat[] = [];

  for (const def of compoundDefinitions) {
    const triggeredCategories = def.requiredCategories.filter(cat => matchedCategories.has(cat));
    if (triggeredCategories.length === def.requiredCategories.length) {
      threats.push({
        id: def.id,
        name: def.name,
        description: def.description,
        severity: def.severity,
        triggeredCategories,
      });
    }
  }

  return threats;
}
