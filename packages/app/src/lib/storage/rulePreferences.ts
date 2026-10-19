import { allRules, rehydrateHeuristics, type DetectionRule } from '@forensicate/scanner';
import type { BuiltInRuleOverride, PersistedConfig } from './types';
import legacyIdentifiers from './legacyRuleSignatures.json';
import { fingerprint, legacyRuleIdentifier, ruleSignature } from './ruleSignature';

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
const ruleTypes = ['keyword', 'regex', 'heuristic', 'encoding', 'structural'];
const ruleSeverities = ['low', 'medium', 'high', 'critical'];
// These checks could never match before version 2 (a tag lookup bug) and are now off by
// default, so an enabled flag in a version 1 snapshot records no working choice.
const neverRanBeforeVersion2 = new Set(['nlp-pos-imperative', 'nlp-sentence-structure']);

const knownLegacyIdentifiers = new Set(legacyIdentifiers);

function clone(rule: DetectionRule): DetectionRule {
  return JSON.parse(JSON.stringify(rule));
}

/** Fields the loader requires of every saved rule. */
export function isStorableRule(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Record<string, unknown>;
  return typeof rule.id === 'string' && typeof rule.name === 'string'
    && typeof rule.type === 'string' && ruleTypes.includes(rule.type)
    && typeof rule.severity === 'string' && ruleSeverities.includes(rule.severity);
}

function isValidOverrideValue(field: string, entry: unknown): boolean {
  if (!ruleFields.includes(field as RuleField)) return false;
  if (['enabled', 'isCustom'].includes(field)) return typeof entry === 'boolean';
  if (field === 'weight') return typeof entry === 'number' && Number.isFinite(entry) && entry >= 1 && entry <= 100;
  if (['keywords', 'owaspLlm', 'owaspAgentic', 'killChain', 'mitreAtlas'].includes(field)) {
    return Array.isArray(entry) && entry.every(item => typeof item === 'string');
  }
  if (typeof entry !== 'string') return false;
  if (field === 'type') return ruleTypes.includes(entry);
  if (field === 'severity') return ruleSeverities.includes(entry);
  return true;
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
  // Save only what the loader accepts, or a single invalid entry would discard every
  // setting. Each ID is saved once: identical copies collapse, a different custom rule
  // that reuses an ID (two YAML files without ids) gets a new one, and the latest edit
  // of a built-in wins.
  const latestBuiltIns = new Map<string, DetectionRule>();
  const savedIds = new Set<string>();
  const savedDefinitions = new Set<string>();
  const renamedBySignature = new Map<string, string>();
  const takenIds = new Set([...byId.keys(), ...rules.map(rule => rule.id)]);
  for (const rule of rules) {
    if (byId.has(rule.id)) {
      latestBuiltIns.set(rule.id, rule);
      continue;
    }
    const definition = JSON.stringify(rule);
    if (!isStorableRule(rule) || savedDefinitions.has(definition)) continue;
    savedDefinitions.add(definition);
    let id = rule.id;
    if (savedIds.has(id)) {
      let copy = 2;
      while (takenIds.has(`${rule.id}-${copy}`)) copy++;
      id = `${rule.id}-${copy}`;
      renamedBySignature.set(ruleSignature(rule), id);
    }
    savedIds.add(id);
    takenIds.add(id);
    localRules.push({ ...clone(rule), id });
  }
  // Sections hold copies of their rules; point them at the IDs the rules were saved under.
  const savedCategories = renamedBySignature.size === 0 ? customCategories : customCategories.map(category => ({
    ...category,
    rules: category.rules.map(entry => {
      const id = entry && typeof entry === 'object' ? renamedBySignature.get(ruleSignature(entry)) : undefined;
      return id ? { ...entry, id } : entry;
    }),
  }));
  for (const rule of latestBuiltIns.values()) {
    const original = byId.get(rule.id)!;
    const values: BuiltInRuleOverride['values'] = {};
    const unset: RuleField[] = [];
    for (const field of ruleFields) {
      if (JSON.stringify(rule[field]) === JSON.stringify(original[field])) continue;
      if (rule[field] === undefined) {
        if (optionalFields.has(field)) unset.push(field);
      } else if (isValidOverrideValue(field, rule[field])) {
        Object.assign(values, { [field]: rule[field] });
      }
    }
    if (Object.keys(values).length || unset.length) {
      // Retain the edited rule if a future release removes its built-in ID.
      const fallback = clone({ ...original, ...values });
      for (const field of unset) delete fallback[field];
      builtInOverrides.push({ id: rule.id, values, unset, fallback });
    }
  }
  return {
    defaultsVersion: fingerprint(defaults.map(ruleSignature).join(':')),
    builtInOverrides,
    localRules,
    customCategories: savedCategories,
  };
}

/** Resolve both version 1 full snapshots and version 2 override-based settings. */
export function resolveRulePreferences(
  stored: StoredRules,
  defaults: DetectionRule[] = allRules,
  knownLegacy: ReadonlySet<string> = knownLegacyIdentifiers,
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
    if (ruleSignature(rule) === ruleSignature(current) || knownLegacy.has(legacyRuleIdentifier(rule))) {
      const keepEnabled = typeof rule.enabled === 'boolean' && !neverRanBeforeVersion2.has(rule.id);
      const migratedRule = { ...clone(current), enabled: keepEnabled ? rule.enabled : current.enabled };
      if (rule.weight !== undefined) migratedRule.weight = rule.weight;
      return migratedRule;
    }
    // An old snapshot cannot prove whether a difference was an intentional edit.
    // Preserve the whole definition, then save its differences as explicit overrides.
    preservedLegacyEdits++;
    return neverRanBeforeVersion2.has(rule.id) ? { ...clone(rule), enabled: current.enabled } : clone(rule);
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
  return Object.entries(override.values).every(([field, entry]) => isValidOverrideValue(field, entry));
}
