import { describe, expect, it } from 'vitest';
import { allRules, type DetectionRule } from '@forensicate/scanner';
import { createRulePreferences, resolveRulePreferences } from '../src/lib/storage/rulePreferences';
import { legacyRuleIdentifier } from '../src/lib/storage/ruleSignature';
import legacySignatures from '../src/lib/storage/legacyRuleSignatures.json';
import { CONFIG_VERSION, STORAGE_KEY, saveConfig, validateConfig, type PersistedConfig } from '../src/lib/storage';
// Untouched built-in definitions as version 1 snapshots saved them in earlier deployed releases.
import earlierReleases from './fixtures/legacyRuleDefinitions.json';

const original: DetectionRule = {
  id: 'fixture-rule', name: 'Fixture rule', description: 'Review fixture',
  type: 'keyword', severity: 'low', enabled: true, keywords: ['old fixture'],
};
const updated: DetectionRule = { ...original, keywords: ['updated fixture'], description: 'Updated description' };
const custom: DetectionRule = { ...original, id: 'custom-fixture', isCustom: true };
const legacy = (rules: DetectionRule[]) => ({ localRules: rules, customCategories: [] });
const known = new Set([legacyRuleIdentifier(original)]);
const config = (rules: PersistedConfig['rules']): PersistedConfig => ({
  version: CONFIG_VERSION, savedAt: '2026-10-16T00:00:00Z', rules,
  prompts: { localPrompts: [], customPromptCategories: [] },
});

describe('versioned rule preferences', () => {
  it('refreshes a recognized legacy default while preserving enabled and weight preferences', () => {
    const result = resolveRulePreferences(legacy([{ ...original, enabled: false, weight: 70 }]), [updated], known);
    expect(result.rules).toEqual([{ ...updated, enabled: false, weight: 70 }]);
    expect(result.preservedLegacyEdits).toBe(0);
  });

  it('preserves ambiguous legacy definitions rather than guessing away user edits', () => {
    const edited = { ...original, keywords: ['my local fixture'], severity: 'high' as const };
    const result = resolveRulePreferences(legacy([edited]), [updated], known);
    expect(result.rules).toEqual([edited]);
    expect(result.preservedLegacyEdits).toBe(1);
    const preferences = createRulePreferences(result.rules, [], [updated]);
    expect(preferences.builtInOverrides?.[0].values.keywords).toEqual(edited.keywords);
  });

  it('lets future default fixes through while retaining only deliberate field overrides', () => {
    const preferences = createRulePreferences([{ ...original, enabled: false, weight: 80 }], [], [original]);
    expect(preferences.localRules).toEqual([]);
    expect(preferences.builtInOverrides?.[0].values).toEqual({ enabled: false, weight: 80 });
    expect(resolveRulePreferences(preferences, [updated]).rules).toEqual([{ ...updated, enabled: false, weight: 80 }]);
  });

  it('preserves intentional pattern edits but updates other default fields', () => {
    const preferences = createRulePreferences([{ ...original, keywords: ['user fixture'] }], [], [original]);
    expect(resolveRulePreferences(preferences, [updated]).rules).toEqual([{ ...updated, keywords: ['user fixture'] }]);
  });

  it('retains custom categories and rules and automatically includes new built-ins', () => {
    const categories = [{ id: 'custom', name: 'Custom', description: 'Personal rules', rules: [custom], isCustom: true }];
    const nextDefault = { ...updated, id: 'new-fixture' };
    const preferences = createRulePreferences([original, custom], categories, [original]);
    expect(preferences.builtInOverrides).toEqual([]);
    expect(preferences.customCategories).toEqual(categories);
    expect(resolveRulePreferences(preferences, [updated, nextDefault]).rules).toEqual([custom, updated, nextDefault]);
  });

  it('retains explicit removal of an optional default value', () => {
    const weighted = { ...original, weight: 60 };
    const preferences = createRulePreferences([original], [], [weighted]);
    expect(preferences.builtInOverrides?.[0].unset).toEqual(['weight']);
    expect(resolveRulePreferences(preferences, [{ ...updated, weight: 90 }]).rules[0].weight).toBeUndefined();
  });

  it('retains an edited rule as custom if its built-in ID is later removed', () => {
    const edited = { ...original, name: 'Personal name', enabled: false };
    const preferences = createRulePreferences([edited], [], [original]);
    expect(resolveRulePreferences(preferences, []).rules).toEqual([{ ...edited, isCustom: true }]);
  });

  it('is repeatable across serialization, reload, and a second save', () => {
    const preferences = createRulePreferences([{ ...original, enabled: false }, custom], [], [original]);
    const loaded = resolveRulePreferences(JSON.parse(JSON.stringify(preferences)), [updated]);
    const savedAgain = createRulePreferences(loaded.rules, [], [updated]);
    const loadedAgain = resolveRulePreferences(savedAgain, [updated]);
    expect(loadedAgain).toEqual(loaded);
    expect(savedAgain.defaultsVersion).not.toBe(preferences.defaultsVersion);
  });

  it('recognizes every snapshot from the pre-migration maintained scanner', () => {
    for (const rule of allRules) {
      expect(legacySignatures).toContain(legacyRuleIdentifier(rule));
    }
  });

  it('recognizes untouched definitions saved by every earlier deployed release', () => {
    const saved = (earlierReleases as Array<{ release: string; rule: DetectionRule }>).map(entry => entry.rule);
    const result = resolveRulePreferences(legacy(saved.map(rule => ({ ...rule, enabled: false }))));
    expect(result.preservedLegacyEdits).toBe(0);
    for (const rule of saved) {
      const current = allRules.find(candidate => candidate.id === rule.id)!;
      expect(result.rules.find(candidate => candidate.id === rule.id)).toEqual({ ...JSON.parse(JSON.stringify(current)), enabled: false });
    }
  });

  it('saves each custom rule under a unique ID and keeps the latest built-in edit', () => {
    const imported = { ...custom, id: 'yaml-plugin' };
    const otherFile = { ...imported, keywords: ['other file fixture'] };
    const preferences = createRulePreferences(
      [imported, original, imported, otherFile, { ...custom, id: 'yaml-plugin-2' }, { ...original, enabled: false }], [], [original]);
    expect(preferences.localRules.map(rule => rule.id)).toEqual(['yaml-plugin', 'yaml-plugin-3', 'yaml-plugin-2']);
    expect(preferences.localRules[1]).toEqual({ ...otherFile, id: 'yaml-plugin-3' });
    expect(preferences.builtInOverrides?.map(override => override.values)).toEqual([{ enabled: false }]);
    expect(validateConfig(config(preferences))).toBe(true);
  });

  it('points sections at the new ID when a reused custom-rule ID is saved under a new one', () => {
    const zebra = { ...custom, id: 'yaml-plugin', name: 'Zebra' };
    const yak = { ...custom, id: 'yaml-plugin', name: 'Yak', keywords: ['yak fixture'] };
    const sections = [
      { id: 'yaml-zebra', name: 'Zebra', description: 'Fixture', rules: [zebra], isCustom: true },
      { id: 'yaml-yak', name: 'Yak', description: 'Fixture', rules: [{ ...yak, enabled: false }], isCustom: true },
    ];
    const preferences = createRulePreferences([zebra, yak], sections, [original]);
    expect(preferences.localRules.map(rule => `${rule.id}:${rule.name}`)).toEqual(['yaml-plugin:Zebra', 'yaml-plugin-2:Yak']);
    expect(preferences.customCategories.map(section => section.rules.map(rule => rule.id))).toEqual([['yaml-plugin'], ['yaml-plugin-2']]);
    const reloaded = resolveRulePreferences(JSON.parse(JSON.stringify(preferences)), [original]);
    expect(createRulePreferences(reloaded.rules, preferences.customCategories, [original])).toEqual(preferences);
  });

  it('drops values the loader would reject rather than every saved setting', () => {
    const malformed = { ...original, weight: 150, enabled: 'false', description: null, keywords: ['kept edit'] } as unknown as DetectionRule;
    const unnamed = { ...custom, id: 'custom-unnamed', name: undefined } as unknown as DetectionRule;
    const preferences = createRulePreferences([malformed, unnamed, custom], [], [original]);
    expect(preferences.builtInOverrides?.[0].values).toEqual({ keywords: ['kept edit'] });
    expect(preferences.builtInOverrides?.[0].fallback).toEqual({ ...original, keywords: ['kept edit'] });
    expect(preferences.localRules).toEqual([custom]);
    expect(validateConfig(config(preferences))).toBe(true);
  });

  it('keeps the two never-run imperative checks off even in an edited version 1 copy', () => {
    const current = allRules.find(rule => rule.id === 'nlp-pos-imperative')!;
    const edited = { ...JSON.parse(JSON.stringify(current)), description: 'My own notes', enabled: true };
    const result = resolveRulePreferences(legacy([edited]));
    expect(result.preservedLegacyEdits).toBe(1);
    expect(result.rules.find(rule => rule.id === current.id)).toMatchObject({ description: 'My own notes', enabled: false });
  });

  it('accepts version 1 hand-off configs that the browser extension writes as "1"', () => {
    expect(validateConfig({ ...config(legacy([])), version: '1' })).toBe(true);
  });

  it('does not overwrite saved settings that fail validation', () => {
    const preferences = createRulePreferences([custom], [], [original]);
    preferences.localRules.push(custom);
    const unreadable = JSON.stringify(config(preferences));
    localStorage.setItem(STORAGE_KEY, unreadable);
    expect(saveConfig(config(createRulePreferences([], []))).success).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(unreadable);
    localStorage.removeItem(STORAGE_KEY);
  });

  it('restores executable built-in heuristics instead of storing functions', () => {
    const preferences = createRulePreferences(allRules, []);
    const restored = resolveRulePreferences(JSON.parse(JSON.stringify(preferences)));
    expect(restored.rules.filter(rule => rule.type === 'heuristic').every(rule => typeof rule.heuristic === 'function')).toBe(true);
  });

  it('requires explicit version 2 preference metadata', () => {
    expect(validateConfig(config(legacy([])))).toBe(false);
    expect(validateConfig(config(createRulePreferences([original], [], [original])))).toBe(true);
    expect(validateConfig({ ...config(legacy([])), version: '1.0' })).toBe(true);
  });

  it.each([
    { values: { heuristic: 'not executable' } },
    { values: { id: 'different-id' } },
    { values: { enabled: 'false' } },
    { values: { keywords: [5] } },
    { values: { severity: 'unknown' } },
    { unset: ['name'] },
    { fallback: { ...original, id: 'wrong-id' } },
  ])('rejects malformed overrides: %j', patch => {
    const preferences = createRulePreferences([{ ...original, enabled: false }], [], [original]);
    Object.assign(preferences.builtInOverrides![0], patch);
    expect(validateConfig(config(preferences))).toBe(false);
  });

  it('does not overwrite a saved configuration from an unsupported future version', () => {
    const future = JSON.stringify({ ...config(legacy([])), version: '99.0', futureData: ['keep'] });
    localStorage.setItem(STORAGE_KEY, future);
    expect(saveConfig(config(createRulePreferences([], []))).success).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(future);
    localStorage.removeItem(STORAGE_KEY);
  });
});
