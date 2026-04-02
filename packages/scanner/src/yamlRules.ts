// YAML Rule File Parser
// Loads detection rules from YAML files, supporting single rules or rule packs.
// Reuses the minimal YAML parser from config.ts for zero-dependency parsing.
//
// Supported YAML format:
//
//   # Single rule
//   id: my-custom-rule
//   name: My Custom Rule
//   type: keyword
//   severity: high
//   keywords:
//     - "ignore instructions"
//     - "disregard"
//
//   # Rule pack (multiple rules in one file)
//   name: My Rule Pack
//   rules:
//     - id: pack-rule-1
//       name: Rule One
//       type: regex
//       severity: medium
//       pattern: "bypass\\s+safety"
//     - id: pack-rule-2
//       name: Rule Two
//       type: keyword
//       severity: high
//       keywords: [override, ignore]

import type { DetectionRule, RuleCategory, RuleSeverity, RuleType, KillChainStage, MitreAtlasCategory, EuAiActRisk } from './types.js';

export interface YamlRuleFile {
  /** Parsed rules ready for use */
  rules: DetectionRule[];
  /** Category metadata */
  category: RuleCategory;
  /** Validation warnings */
  warnings: string[];
}

/**
 * Parse a YAML rule file string into DetectionRule objects.
 * Supports both single-rule files and multi-rule pack files.
 */
export function parseYamlRuleFile(yaml: string, filename?: string): YamlRuleFile {
  const warnings: string[] = [];
  const lines = yaml.split('\n');

  // Detect if this is a rule pack (has top-level "rules:" key with nested items)
  const isRulePack = lines.some(l => /^rules:\s*$/.test(l.trim()));

  if (isRulePack) {
    return parseRulePack(lines, filename, warnings);
  }
  return parseSingleRule(lines, filename, warnings);
}

// ---------------------------------------------------------------------------
// Single rule parser
// ---------------------------------------------------------------------------

function parseSingleRule(lines: string[], filename: string | undefined, warnings: string[]): YamlRuleFile {
  const raw = parseSimpleYaml(lines);
  const rule = rawToRule(raw, warnings, 'plugin');

  if (!rule) {
    return {
      rules: [],
      category: { id: 'yaml-plugin', name: 'YAML Plugin Rules', description: 'Rules loaded from YAML files', rules: [], isCustom: true },
      warnings: [...warnings, 'Failed to parse rule from YAML'],
    };
  }

  const categoryId = `yaml-${filename?.replace(/\.(ya?ml)$/i, '').replace(/[^a-z0-9-]/gi, '-') || 'plugin'}`;
  const category: RuleCategory = {
    id: categoryId,
    name: rule.name,
    description: rule.description || `Loaded from ${filename || 'YAML file'}`,
    rules: [rule],
    isCustom: true,
    source: filename,
  };

  return { rules: [rule], category, warnings };
}

// ---------------------------------------------------------------------------
// Rule pack parser
// ---------------------------------------------------------------------------

function parseRulePack(lines: string[], filename: string | undefined, warnings: string[]): YamlRuleFile {
  // Parse top-level metadata
  const topLevel: Record<string, string> = {};
  const ruleBlocks: string[][] = [];
  let inRules = false;
  let currentBlock: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, ''); // strip comments

    if (/^rules:\s*$/.test(line.trim())) {
      inRules = true;
      continue;
    }

    if (!inRules) {
      const match = line.match(/^(\w[\w-]*):\s*(.+)/);
      if (match) {
        topLevel[match[1]] = match[2].trim();
      }
      continue;
    }

    // Inside rules section
    if (/^\s+-\s+\w/.test(line)) {
      // New rule item (starts with "  - key:")
      if (currentBlock) ruleBlocks.push(currentBlock);
      // Convert "  - key: value" → "key: value"
      currentBlock = [line.replace(/^\s+-\s+/, '')];
    } else if (/^\s{4,}\w/.test(line) && currentBlock) {
      // Continuation of current rule (indented)
      currentBlock.push(line.replace(/^\s{4,}/, ''));
    } else if (/^\s+-\s+"/.test(line) || /^\s+-\s+[^-]/.test(line)) {
      // List item within current rule
      if (currentBlock) currentBlock.push(line.replace(/^\s{4,}/, ''));
    }
  }
  if (currentBlock) ruleBlocks.push(currentBlock);

  // Parse each rule block
  const rules: DetectionRule[] = [];
  for (let i = 0; i < ruleBlocks.length; i++) {
    const raw = parseSimpleYaml(ruleBlocks[i]);
    const rule = rawToRule(raw, warnings, `plugin-pack-${i}`);
    if (rule) rules.push(rule);
  }

  const packName = topLevel.name || filename?.replace(/\.(ya?ml)$/i, '') || 'YAML Rule Pack';
  const categoryId = `yaml-${packName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

  const category: RuleCategory = {
    id: categoryId,
    name: packName,
    description: topLevel.description || `${rules.length} rules loaded from ${filename || 'YAML file'}`,
    rules,
    isCustom: true,
    source: filename,
  };

  return { rules, category, warnings };
}

// ---------------------------------------------------------------------------
// Minimal YAML parser (key-value + lists)
// ---------------------------------------------------------------------------

function parseSimpleYaml(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (line.trim() === '') continue;

    // List item
    if (/^\s*-\s+/.test(line)) {
      const value = line.replace(/^\s*-\s+/, '').trim();
      if (currentList) {
        currentList.push(unquote(value));
      }
      continue;
    }

    // Key-value pair
    const match = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (match) {
      // Flush previous list
      if (currentKey && currentList) {
        result[currentKey] = currentList;
      }

      const key = match[1];
      const rawValue = match[2].trim();

      if (rawValue === '') {
        currentKey = key;
        currentList = [];
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        result[key] = rawValue.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(s => s);
        currentKey = null;
        currentList = null;
      } else {
        result[key] = parseScalar(unquote(rawValue));
        currentKey = null;
        currentList = null;
      }
    }
  }

  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }

  return result;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseScalar(s: string): string | number | boolean {
  if (s === 'true') return true;
  if (s === 'false') return false;
  const num = Number(s);
  if (!isNaN(num) && s !== '') return num;
  return s;
}

// ---------------------------------------------------------------------------
// Raw object → DetectionRule conversion
// ---------------------------------------------------------------------------

const VALID_TYPES: RuleType[] = ['keyword', 'regex'];
const VALID_SEVERITIES: RuleSeverity[] = ['low', 'medium', 'high', 'critical'];
const VALID_KILL_CHAIN: KillChainStage[] = [
  'initial-access', 'privilege-escalation', 'reconnaissance',
  'persistence', 'command-and-control', 'lateral-movement', 'exfiltration',
];

function rawToRule(raw: Record<string, unknown>, warnings: string[], fallbackId: string): DetectionRule | null {
  const id = String(raw.id || fallbackId);
  const name = String(raw.name || '');
  const type = String(raw.type || '') as RuleType;
  const severity = String(raw.severity || 'medium') as RuleSeverity;

  if (!name) {
    warnings.push(`Rule "${id}": missing name`);
    return null;
  }

  if (!VALID_TYPES.includes(type)) {
    warnings.push(`Rule "${id}": invalid type "${type}" (must be keyword or regex)`);
    return null;
  }

  if (!VALID_SEVERITIES.includes(severity)) {
    warnings.push(`Rule "${id}": invalid severity "${severity}"`);
    return null;
  }

  const rule: DetectionRule = {
    id: `yaml-${id}`,
    name,
    description: String(raw.description || ''),
    type,
    severity,
    enabled: true,
    isCustom: true,
  };

  // Type-specific fields
  if (type === 'keyword') {
    const keywords = Array.isArray(raw.keywords) ? raw.keywords.map(String) : null;
    if (!keywords || keywords.length === 0) {
      warnings.push(`Rule "${id}": keyword rule must have at least one keyword`);
      return null;
    }
    rule.keywords = keywords;
  } else if (type === 'regex') {
    const pattern = String(raw.pattern || '');
    if (!pattern) {
      warnings.push(`Rule "${id}": regex rule must have a pattern`);
      return null;
    }
    if (pattern.length > 2000) {
      warnings.push(`Rule "${id}": regex pattern too long (max 2000 chars)`);
      return null;
    }
    // Reject patterns with known ReDoS constructs: nested quantifiers like (a+)+, (a*)*
    if (/([+*])\)[\+\*]/.test(pattern) || /\(\?:[^)]*[+*]\)[+*]/.test(pattern)) {
      warnings.push(`Rule "${id}": regex pattern rejected — nested quantifiers may cause catastrophic backtracking`);
      return null;
    }
    // Validate flags
    const flagsStr = String(raw.flags || 'gi');
    if (!/^[gimsuy]*$/.test(flagsStr)) {
      warnings.push(`Rule "${id}": invalid regex flags "${flagsStr}" (allowed: g, i, m, s, u, y)`);
      return null;
    }
    // Validate regex compiles
    try {
      new RegExp(pattern, flagsStr);
    } catch {
      warnings.push(`Rule "${id}": invalid regex pattern "${pattern}"`);
      return null;
    }
    rule.pattern = pattern;
    rule.flags = flagsStr;
  }

  // Optional fields
  if (typeof raw.weight === 'number') {
    rule.weight = Math.max(0, Math.min(100, raw.weight));
  }

  // Kill chain mapping
  if (Array.isArray(raw['kill-chain'])) {
    const stages = raw['kill-chain'].filter((s): s is KillChainStage =>
      typeof s === 'string' && VALID_KILL_CHAIN.includes(s as KillChainStage)
    );
    if (stages.length > 0) rule.killChain = stages;
  }

  // MITRE ATLAS
  if (Array.isArray(raw['mitre-atlas'])) {
    rule.mitreAtlas = raw['mitre-atlas'].filter((s): s is MitreAtlasCategory =>
      typeof s === 'string' && s.startsWith('AML.')
    );
  }

  // EU AI Act risk
  if (typeof raw['eu-ai-act-risk'] === 'string' &&
      ['unacceptable', 'high', 'limited', 'minimal'].includes(raw['eu-ai-act-risk'])) {
    rule.euAiActRisk = raw['eu-ai-act-risk'] as EuAiActRisk;
  }

  return rule;
}
