import { allRules, rehydrateHeuristics, type DetectionRule } from '@forensicate/scanner';
import type { BuiltInRuleOverride, PersistedConfig } from './types';
import legacySignatures from './legacyRuleSignatures.json';
import { fingerprint, ruleSignature } from './ruleSignature';

type StoredRules = PersistedConfig['rules'];
type RuleField = Exclude<keyof DetectionRule, 'id' | 'heuristic'>;

const ruleFields: RuleField[] = [
  'name', 'description', 'type', 'severity', 'enabled', 'keywords', 'pattern',
  'flags', 'weight', 'owaspLlm', 'owaspAgentic', 'killChain', 'mitreAtlas',
  'euAiActRisk', 'isCustom',
];
const optionalFields = new Set<RuleField>([
  'keywords', 'pattern', 'flags', 'weight', 'owaspLlm', 'owaspAgentic',
  'killChain', 'mitreAtlas', 'euAiActRisk', 'isCustom',
]);

function clone(rule: DetectionRule): DetectionRule {
  return JSON.parse(JSON.stringify(rule));
}

/** Store only deliberate changes to built-ins; untouched definitions come from code. */
export function createRulePreferences(
  rules: DetectionRule[],
  customCategories: StoredRules['customCategories'],
  defaults: DetectionRule[] = allRules,
): StoredRules {
  const byId = new Map(defaults.map(rule => [rule.id, rule]));
  const builtInOverrides: BuiltInRuleOverride[] = [];
  const localRules: DetectionRule[] = [];
  for (const rule of rules) {
    const original = byId.get(rule.id);
    if (!original) {
      localRules.push(clone(rule));
      continue;
    }
    const values: BuiltInRuleOverride['values'] = {};
    const unset: RuleField[] = [];
    for (const field of ruleFields) {
      if (JSON.stringify(rule[field]) === JSON.stringify(original[field])) continue;
      if (rule[field] === undefined) {
        if (optionalFields.has(field)) unset.push(field);
      } else {
        Object.assign(values, { [field]: rule[field] });
      }
    }
    if (Object.keys(values).length || unset.length) {
      // Retain an edited rule if a future release removes its built-in ID.
      builtInOverrides.push({ id: rule.id, values, unset, fallback: clone(rule) });
    }
  }
  return {
    defaultsVersion: fingerprint(defaults.map(ruleSignature).join(':')),
    builtInOverrides,
    localRules,
    customCategories,
  };
}

/** Resolve both version 1 full snapshots and version 2 override-based settings. */
export function resolveRulePreferences(
  stored: StoredRules,
  defaults: DetectionRule[] = allRules,
  knownLegacy: Record<string, string[]> = legacySignatures,
): { rules: DetectionRule[]; preservedLegacyEdits: number } {
  const byId = new Map(defaults.map(rule => [rule.id, rule]));
  if (stored.builtInOverrides) {
    const overrides = new Map(stored.builtInOverrides.map(override => [override.id, override]));
    const custom = stored.localRules.map(clone);
    const customIds = new Set(custom.map(rule => rule.id));
    for (const override of stored.builtInOverrides) {
      if (!byId.has(override.id) && !customIds.has(override.id)) {
        custom.push({ ...clone(override.fallback), isCustom: true });
      }
    }
    const builtIns = defaults.filter(rule => !customIds.has(rule.id)).map(rule => {
      const resolved = clone(rule);
      const override = overrides.get(rule.id);
      if (override) {
        Object.assign(resolved, override.values);
        for (const field of override.unset) {
          if (optionalFields.has(field)) delete resolved[field];
        }
      }
      return resolved;
    });
    return { rules: rehydrateHeuristics([...custom, ...builtIns]), preservedLegacyEdits: 0 };
  }

  let preservedLegacyEdits = 0;
  const storedIds = new Set(stored.localRules.map(rule => rule.id));
  const migrated = stored.localRules.map(rule => {
    const current = byId.get(rule.id);
    if (!current) return clone(rule);
    const signature = ruleSignature(rule);
    if (signature === ruleSignature(current) || knownLegacy[rule.id]?.includes(signature)) {
      const migratedRule = { ...clone(current), enabled: typeof rule.enabled === 'boolean' ? rule.enabled : current.enabled };
      if (rule.weight !== undefined) migratedRule.weight = rule.weight;
      return migratedRule;
    }
    // An old snapshot cannot prove whether a difference was an intentional edit.
    // Preserve the whole definition, then save its differences as explicit overrides.
    preservedLegacyEdits++;
    return clone(rule);
  });
  return {
    rules: rehydrateHeuristics([...migrated, ...defaults.filter(rule => !storedIds.has(rule.id)).map(clone)]),
    preservedLegacyEdits,
  };
}

export function validateRuleOverride(value: unknown): value is BuiltInRuleOverride {
  if (!value || typeof value !== 'object') return false;
  const override = value as BuiltInRuleOverride;
  if (typeof override.id !== 'string' || !override.values || typeof override.values !== 'object'
      || Array.isArray(override.values) || !Array.isArray(override.unset)) return false;
  if (override.unset.some(field => !optionalFields.has(field))) return false;
  if (override.unset.some(field => Object.hasOwn(override.values, field))) return false;
  if (!override.fallback || override.fallback.id !== override.id) return false;
  for (const [field, entry] of Object.entries(override.values)) {
    if (!ruleFields.includes(field as RuleField)) return false;
    if (['enabled', 'isCustom'].includes(field)) {
      if (typeof entry !== 'boolean') return false;
    } else if (field === 'weight') {
      if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 1 || entry > 100) return false;
    } else if (['keywords', 'owaspLlm', 'owaspAgentic', 'killChain', 'mitreAtlas'].includes(field)) {
      if (!Array.isArray(entry) || entry.some(item => typeof item !== 'string')) return false;
    } else if (typeof entry !== 'string') return false;
    if (field === 'type' && !['keyword', 'regex', 'heuristic', 'encoding', 'structural'].includes(entry as string)) return false;
    if (field === 'severity' && !['low', 'medium', 'high', 'critical'].includes(entry as string)) return false;
  }
  return true;
}
