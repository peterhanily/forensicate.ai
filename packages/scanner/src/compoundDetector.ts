// Compound Threat Detection
// Identifies when multiple attack categories are present simultaneously,
// indicating sophisticated multi-vector attacks.

import type { RuleMatch, CompoundThreat, RuleSeverity } from './types.js';
import { ruleCategories } from './rules.js';

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
  {
    id: 'compound-exfiltration-chain',
    name: 'Exfiltration Chain Attack',
    description: 'Prompt extraction combined with context manipulation suggests coordinated data theft',
    severity: 'critical',
    requiredCategories: ['prompt-extraction', 'context-manipulation'],
  },
  {
    id: 'compound-file-hidden-injection',
    name: 'File Hidden Injection',
    description: 'File analysis threats combined with instruction override indicates a document-based injection attack',
    severity: 'critical',
    requiredCategories: ['file-analysis', 'instruction-override'],
  },
  {
    id: 'compound-file-exfiltration',
    name: 'File-Based Exfiltration',
    description: 'File analysis threats combined with prompt extraction suggests document-embedded data theft',
    severity: 'critical',
    requiredCategories: ['file-analysis', 'prompt-extraction'],
  },
  {
    id: 'compound-worm-injection',
    name: 'Worm Injection Chain',
    description: 'Self-replicating instructions combined with instruction override indicates an AI worm attack (Morris II / RAGworm)',
    severity: 'critical',
    requiredCategories: ['worm-propagation', 'instruction-override'],
  },
  {
    id: 'compound-rag-poisoning',
    name: 'RAG Poisoning Attack',
    description: 'RAG authority signals combined with instruction override indicates a targeted RAG corpus poisoning attack',
    severity: 'critical',
    requiredCategories: ['rag-security', 'instruction-override'],
  },
  {
    id: 'compound-agent-lateral',
    name: 'Agent Lateral Movement',
    description: 'Cross-agent injection combined with MCP tool exploitation indicates lateral movement across an agent network',
    severity: 'critical',
    requiredCategories: ['mcp-agent-security', 'worm-propagation'],
  },
  {
    id: 'compound-persistent-exfiltration',
    name: 'Persistent Exfiltration Campaign',
    description: 'Delayed triggers combined with exfiltration indicates a time-bomb exfiltration campaign (SpAIware)',
    severity: 'critical',
    requiredCategories: ['temporal-conditional', 'exfiltration-supply-chain'],
  },
  {
    id: 'compound-output-compromise',
    name: 'Output Compromise Detected',
    description: 'Output forensics markers combined with jailbreak indicators confirm a successful model compromise',
    severity: 'critical',
    requiredCategories: ['output-forensics', 'jailbreak'],
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
