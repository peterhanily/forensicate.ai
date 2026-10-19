import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allRules } from '@forensicate/scanner';
import { usePersistedConfig } from '../src/hooks/usePersistedConfig';
import { CONFIG_VERSION, STORAGE_KEY, type PersistedConfig } from '../src/lib/storage';
import { createRulePreferences } from '../src/lib/storage/rulePreferences';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/scanner');
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

function storedConfig(): PersistedConfig {
  return {
    version: '1.0', savedAt: '2026-06-10T00:00:00Z',
    rules: { localRules: [], customCategories: [] },
    prompts: { localPrompts: [], customPromptCategories: [] },
    ui: { confidenceThreshold: 0, autoImportCommunityRules: false, tourCompleted: true },
  };
}

describe('saved-rule migration through the app hook', () => {
  it('migrates a legacy snapshot, saves only overrides, and preserves the next reload', async () => {
    const original = allRules.find(rule => rule.type === 'keyword')!;
    const edited = { ...original, keywords: ['personal review fixture'], enabled: false, weight: 75 };
    const customRule = { ...edited, id: 'custom-review', isCustom: true };
    const legacy = storedConfig();
    legacy.rules.localRules = [edited, customRule];
    legacy.rules.customCategories = [{ id: 'custom-section', name: 'Personal', description: 'Notes', rules: [customRule], isCustom: true }];
    legacy.prompts.customPromptCategories = [{ id: 'custom-prompts', name: 'Personal', description: 'Notes', prompts: [] }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const first = renderHook(() => usePersistedConfig());
    expect(first.result.current.migrationNotice).toContain('1 saved rule definition differs');
    expect(first.result.current.localRules.find(rule => rule.id === original.id)).toEqual(edited);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const saved: PersistedConfig = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.version).toBe(CONFIG_VERSION);
    expect(saved.rules.localRules).toEqual([customRule]);
    expect(saved.rules.builtInOverrides).toHaveLength(1);
    expect(saved.rules.customCategories).toEqual(legacy.rules.customCategories);
    first.unmount();

    const second = renderHook(() => usePersistedConfig());
    expect(second.result.current.localRules.find(rule => rule.id === original.id)).toEqual(edited);
    expect(second.result.current.customCategories).toEqual(legacy.rules.customCategories);
    expect(second.result.current.customPromptCategories).toEqual(legacy.prompts.customPromptCategories);
    expect(second.result.current.confidenceThreshold).toBe(0);
    expect(second.result.current.autoImportCommunityRules).toBe(false);
    expect(second.result.current.tourCompleted).toBe(true);
    expect(second.result.current.migrationNotice).toBeNull();
    second.unmount();
  });

  it('loads current definitions when a saved override comes from an older default set', () => {
    const current = allRules.find(rule => rule.type === 'keyword')!;
    const older = { ...current, keywords: ['older fixture'], description: 'Previous built-in definition' };
    const preferences = createRulePreferences([{ ...older, enabled: false }], [], [older]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...storedConfig(), version: CONFIG_VERSION, rules: preferences }));
    const hook = renderHook(() => usePersistedConfig());
    expect(hook.result.current.localRules.find(rule => rule.id === current.id)).toEqual({ ...current, enabled: false });
    hook.unmount();
  });

  const yamlRule = { id: 'yaml-plugin', name: 'Imported', description: 'From YAML', type: 'keyword' as const, severity: 'high' as const, enabled: true, keywords: ['zebra canary'] };
  it.each([
    ['the same YAML file imported twice', ['yaml-plugin'], (legacy: PersistedConfig) => {
      legacy.rules.localRules = [...allRules, yamlRule, yamlRule];
    }],
    ['two YAML files without ids', ['yaml-plugin', 'yaml-plugin-2'], (legacy: PersistedConfig) => {
      legacy.rules.localRules = [...allRules, yamlRule, { ...yamlRule, name: 'Other file', keywords: ['yak canary'] }];
    }],
    ['a built-in value the editor cannot produce', [], (legacy: PersistedConfig) => {
      legacy.rules.localRules = allRules.map((rule, index) => index === 0 ? { ...rule, weight: 150 }
        : index === 1 ? { ...rule, enabled: 'false' as unknown as boolean } : rule);
    }],
  ])('keeps every setting across reloads after %s', async (_label, savedYamlIds, mutate) => {
    const legacy = storedConfig();
    mutate(legacy);
    legacy.prompts.customPromptCategories = [{ id: 'custom-prompts', name: 'Personal', description: 'Notes', prompts: [] }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    for (let visit = 0; visit < 3; visit++) {
      const hook = renderHook(() => usePersistedConfig());
      expect(hook.result.current.loadSource).toBe('localStorage');
      expect(hook.result.current.customPromptCategories).toEqual(legacy.prompts.customPromptCategories);
      expect(hook.result.current.tourCompleted).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(600); });
      expect(hook.result.current.error).toBeNull();
      hook.unmount();
    }
    const saved: PersistedConfig = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.rules.localRules.map(rule => rule.id).filter(id => id.startsWith('yaml-'))).toEqual(savedYamlIds);
  });

  it('keeps saved settings it cannot read until an explicit reset', async () => {
    const unreadable = createRulePreferences([], []);
    unreadable.localRules = [{ ...allRules[0], id: 'custom-a', isCustom: true }, { ...allRules[0], id: 'custom-a', isCustom: true }];
    const stored = JSON.stringify({ ...storedConfig(), version: CONFIG_VERSION, rules: unreadable });
    localStorage.setItem(STORAGE_KEY, stored);
    const hook = renderHook(() => usePersistedConfig());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    expect(hook.result.current.error).toContain('could not be read');
    act(() => hook.result.current.resetToDefaults());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(CONFIG_VERSION);
    expect(hook.result.current.error).toBeNull();
    hook.unmount();
  });

  it('turns off imperative checks that a version 1 snapshot saved as enabled before they could run', () => {
    const legacy = storedConfig();
    legacy.rules.localRules = allRules.map(rule => ({ ...rule, enabled: true }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const hook = renderHook(() => usePersistedConfig());
    const enabled = new Map(hook.result.current.localRules.map(rule => [rule.id, rule.enabled]));
    expect(enabled.get('nlp-pos-imperative')).toBe(false);
    expect(enabled.get('nlp-sentence-structure')).toBe(false);
    expect(enabled.get('nlp-entity-impersonation')).toBe(true);
    expect(hook.result.current.migrationNotice).toBeNull();
    hook.unmount();
  });

  it('leaves future-version settings untouched until an explicit reset', async () => {
    const future = JSON.stringify({ ...storedConfig(), version: '99.0', futureData: ['preserve'] });
    localStorage.setItem(STORAGE_KEY, future);
    const hook = renderHook(() => usePersistedConfig());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(future);
    expect(hook.result.current.error).toContain('unsupported version');
    act(() => hook.result.current.resetToDefaults());
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(CONFIG_VERSION);
    expect(hook.result.current.error).toBeNull();
    hook.unmount();
  });
});
