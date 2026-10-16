import { createElement, StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectionRule } from '@forensicate/scanner';
import { usePersistedConfig } from '../src/hooks/usePersistedConfig';
import { CONFIG_VERSION, saveConfig, type PersistedConfig } from '../src/lib/storage';
import { decodeConfig, encodeConfig } from '../src/lib/storage/urlHash';
import { createRulePreferences, resolveRulePreferences } from '../src/lib/storage/rulePreferences';

function sharedConfig(overrides: Partial<PersistedConfig> = {}): PersistedConfig {
  return {
    version: CONFIG_VERSION,
    savedAt: '2026-01-01T00:00:00.000Z',
    rules: createRulePreferences([], []),
    prompts: { localPrompts: [], customPromptCategories: [] },
    ...overrides,
  };
}

function strictMode({ children }: PropsWithChildren) {
  return createElement(StrictMode, null, children);
}

describe('shared configuration round trips', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/scanner');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['browser', 'hash'])('consumes a %s URL only after rendering in StrictMode', mode => {
    const config = sharedConfig({ session: { promptText: 'Shared review fixture' } });
    const query = `config=${encodeConfig(config)}&view=review`;
    window.history.replaceState(null, '', mode === 'hash' ? `/#/scanner?${query}` : `/scanner?${query}`);
    const consumedDuringRender: boolean[] = [];

    const { result } = renderHook(() => {
      const state = usePersistedConfig();
      consumedDuringRender.push(!window.location.href.includes('config='));
      return state;
    }, { wrapper: strictMode });

    expect(consumedDuringRender).not.toContain(true);
    expect(result.current.loadSource).toBe('url');
    expect(result.current.initialPromptText).toBe('Shared review fixture');
    expect(window.location.href).not.toContain('config=');
    expect(window.location.href).toContain('view=review');
  });

  const edits: Array<{ field: string; type: DetectionRule['type']; patch: Partial<DetectionRule> }> = [
    { field: 'keywords', type: 'keyword', patch: { keywords: ['review fixture'] } },
    { field: 'pattern', type: 'regex', patch: { pattern: 'review-fixture' } },
    { field: 'flags', type: 'regex', patch: { flags: 'm' } },
    { field: 'name', type: 'keyword', patch: { name: 'Reviewed rule' } },
    { field: 'description', type: 'keyword', patch: { description: 'Local review notes' } },
    { field: 'severity', type: 'keyword', patch: { severity: 'low' } },
  ];

  it.each(edits)('preserves a built-in $field edit without sharing unchanged defaults', ({ type, patch }) => {
    const { result, unmount } = renderHook(() => usePersistedConfig());
    const original = result.current.localRules.find(rule => rule.type === type && rule.severity !== 'low')!;
    const edited = { ...original, ...patch };

    act(() => {
      result.current.setLocalRules(rules => rules.map(rule => rule.id === original.id ? edited : rule));
    });

    const url = new URL(result.current.generateShareUrl());
    const decoded = decodeConfig(url.searchParams.get('config')!);
    expect(decoded?.rules.localRules).toEqual([]);
    expect(decoded?.rules.builtInOverrides).toHaveLength(1);
    expect(resolveRulePreferences(decoded!.rules).rules.find(rule => rule.id === edited.id)).toEqual(edited);

    unmount();
    window.history.replaceState(null, '', url);
    const recipient = renderHook(() => usePersistedConfig());
    expect(recipient.result.current.localRules.find(rule => rule.id === original.id)).toEqual(edited);
    expect(recipient.result.current.localRules.length).toBeGreaterThan(1);
  });

  it('shares a zero confidence threshold and prioritizes it over recipient preferences', () => {
    const sender = renderHook(() => usePersistedConfig());
    act(() => sender.result.current.setConfidenceThreshold(0));
    const url = sender.result.current.generateShareUrl();
    sender.unmount();

    saveConfig(sharedConfig({ ui: { confidenceThreshold: 85, tourCompleted: true } }));
    window.history.replaceState(null, '', url);
    const recipient = renderHook(() => usePersistedConfig());

    expect(recipient.result.current.confidenceThreshold).toBe(0);
    expect(recipient.result.current.tourCompleted).toBe(true);
  });

  it('keeps recipient preferences for older links without a shared threshold', () => {
    saveConfig(sharedConfig({ ui: { confidenceThreshold: 70 } }));
    window.history.replaceState(null, '', `/scanner?config=${encodeConfig(sharedConfig())}`);

    const { result } = renderHook(() => usePersistedConfig());
    expect(result.current.confidenceThreshold).toBe(70);
  });
});
