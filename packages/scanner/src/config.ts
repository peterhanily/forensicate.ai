// Forensicate.ai Configuration
// Loads and validates a forensicate.yaml / forensicate.yml config file.
// Uses a minimal YAML subset parser (no external dependency) that handles:
//   - key: value pairs
//   - key: [array, items]
//   - key:\n  - list items
//   - nested objects (one level)
//   - comments (#)
//   - quoted strings

import type { RuleSeverity } from './types.js';

export interface ForensicateConfig {
  /** Minimum confidence threshold (0-99) */
  threshold?: number;
  /** Rule severity filter — only run rules at or above this level */
  minSeverity?: RuleSeverity;
  /** Rule category IDs to enable (whitelist) */
  categories?: string[];
  /** Rule category IDs to disable (blacklist) */
  disableCategories?: string[];
  /** Specific rule IDs to disable */
  disableRules?: string[];
  /** Output format */
  output?: 'text' | 'json' | 'sarif';
  /** Glob patterns to scan */
  paths?: string[];
  /** Scan mode */
  scanMode?: 'changed' | 'all';
  /** Whether to fail on finding */
  failOnFinding?: boolean;
  /** File extensions to scan (overrides defaults) */
  extensions?: string[];
  /** Max file size in KB */
  maxFileSizeKb?: number;
}

/**
 * Parse a simple YAML string into a config object.
 * Handles the subset of YAML used by forensicate config files.
 */
export function parseConfigYaml(yaml: string): ForensicateConfig {
  const config: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd(); // Remove comments

    // Skip empty lines
    if (line.trim() === '') {
      if (currentKey && currentList) {
        config[currentKey] = currentList;
        currentKey = null;
        currentList = null;
      }
      continue;
    }

    // List item (indented with -)
    if (/^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, '').trim();
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
        config[currentKey] = currentList;
      }

      const key = camelCase(match[1]);
      const rawValue = match[2].trim();

      if (rawValue === '') {
        // Start of a list or nested object
        currentKey = key;
        currentList = [];
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        // Inline array: [a, b, c]
        const items = rawValue.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(s => s);
        config[key] = items;
        currentKey = null;
        currentList = null;
      } else {
        // Scalar value
        config[key] = parseScalar(unquote(rawValue));
        currentKey = null;
        currentList = null;
      }
    }
  }

  // Flush trailing list
  if (currentKey && currentList) {
    config[currentKey] = currentList;
  }

  return validateConfig(config);
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

function camelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function validateConfig(raw: Record<string, unknown>): ForensicateConfig {
  const config: ForensicateConfig = {};

  if (typeof raw.threshold === 'number') {
    config.threshold = Math.max(0, Math.min(99, raw.threshold));
  }

  if (typeof raw.minSeverity === 'string' && ['low', 'medium', 'high', 'critical'].includes(raw.minSeverity)) {
    config.minSeverity = raw.minSeverity as RuleSeverity;
  }

  if (Array.isArray(raw.categories)) {
    config.categories = raw.categories.filter((s): s is string => typeof s === 'string');
  }

  if (Array.isArray(raw.disableCategories)) {
    config.disableCategories = raw.disableCategories.filter((s): s is string => typeof s === 'string');
  }

  if (Array.isArray(raw.disableRules)) {
    config.disableRules = raw.disableRules.filter((s): s is string => typeof s === 'string');
  }

  if (typeof raw.output === 'string' && ['text', 'json', 'sarif'].includes(raw.output)) {
    config.output = raw.output as ForensicateConfig['output'];
  }

  if (Array.isArray(raw.paths)) {
    config.paths = raw.paths.filter((s): s is string => typeof s === 'string');
  }

  if (typeof raw.scanMode === 'string' && ['changed', 'all'].includes(raw.scanMode)) {
    config.scanMode = raw.scanMode as ForensicateConfig['scanMode'];
  }

  if (typeof raw.failOnFinding === 'boolean') {
    config.failOnFinding = raw.failOnFinding;
  }

  if (Array.isArray(raw.extensions)) {
    config.extensions = raw.extensions.filter((s): s is string => typeof s === 'string');
  }

  if (typeof raw.maxFileSizeKb === 'number') {
    config.maxFileSizeKb = Math.max(1, raw.maxFileSizeKb);
  }

  return config;
}

/**
 * Apply config to filter rules from categories.
 * Returns the filtered set of enabled rule IDs and the effective threshold.
 */
export function applyConfigToRules(
  config: ForensicateConfig,
  allCategories: Array<{ id: string; rules: Array<{ id: string; severity: RuleSeverity; enabled: boolean }> }>
): { enabledRuleIds: Set<string>; threshold: number } {
  const severityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const minSevRank = severityRank[config.minSeverity ?? 'low'] ?? 0;
  const enabledRuleIds = new Set<string>();

  for (const category of allCategories) {
    // Skip if category whitelist exists and this category isn't in it
    if (config.categories?.length && !config.categories.includes(category.id)) {
      continue;
    }

    // Skip if category is blacklisted
    if (config.disableCategories?.includes(category.id)) {
      continue;
    }

    for (const rule of category.rules) {
      if (!rule.enabled) continue;

      // Skip if rule is individually disabled
      if (config.disableRules?.includes(rule.id)) continue;

      // Skip if below minimum severity
      if ((severityRank[rule.severity] ?? 0) < minSevRank) continue;

      enabledRuleIds.add(rule.id);
    }
  }

  return {
    enabledRuleIds,
    threshold: config.threshold ?? 0,
  };
}
