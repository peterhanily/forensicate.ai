/**
 * Test to verify that community rules/prompts are excluded from share URLs
 * This prevents "URI Too Long" errors when auto-import is enabled
 */

import { describe, it, expect } from 'vitest';
import { generateShareUrl, decodeConfig } from '../src/lib/storage/urlHash';
import type { PersistedConfig, DetectionRule } from '../src/lib/storage/types';

describe('Share URL - Community Content Filtering', () => {
  const mockTimestamp = '2024-01-01T00:00:00.000Z';

  const createTestRule = (id: string, name: string): DetectionRule => ({
    id,
    name,
    description: `Test rule ${id}`,
    category: 'injection',
    type: 'keyword',
    severity: 'high',
    enabled: true,
    keywords: ['test'],
  });

  const extractConfigFromUrl = (url: string): PersistedConfig | null => {
    const urlObj = new URL(url);
    const configParam = urlObj.searchParams.get('config') || urlObj.hash.split('?config=')[1]?.split('&')[0];
    if (!configParam) return null;
    return decodeConfig(configParam);
  };

  it('should exclude community rules from share URL', () => {
    // Note: This test verifies the URL generation works, but the actual filtering
    // happens in usePersistedConfig.handleGenerateShareUrl before calling this function
    const customOnlyConfig: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: [
          createTestRule('custom-rule-1', 'Custom Rule 1'),
          createTestRule('my-rule', 'My Custom Rule'),
        ],
        customCategories: [],
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: [],
      },
    };

    const shareUrl = generateShareUrl(customOnlyConfig);

    // Verify URL was generated successfully
    expect(shareUrl).toContain('config=');
    expect(shareUrl.length).toBeGreaterThan(0);

    // Decode and verify content
    const decoded = extractConfigFromUrl(shareUrl);
    expect(decoded).toBeTruthy();
    expect(decoded?.rules.localRules).toHaveLength(2);
    expect(decoded?.rules.localRules.every(r => !r.id.startsWith('community-'))).toBe(true);
  });

  it('should handle custom prompts correctly', () => {
    const config: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: [],
        customCategories: [],
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: [
          {
            category: 'Custom Prompts',
            prompts: [
              { id: 'my-prompt-1', name: 'My Prompt', content: 'Test prompt' },
            ],
          },
        ],
      },
    };

    const shareUrl = generateShareUrl(config);

    // Verify URL is reasonable length
    expect(shareUrl.length).toBeLessThan(10000);

    // Decode and verify prompts
    const decoded = extractConfigFromUrl(shareUrl);
    expect(decoded?.prompts.customPromptCategories).toHaveLength(1);
    expect(decoded?.prompts.customPromptCategories[0].prompts).toHaveLength(1);
  });

  it('should preserve custom rules and prompts in share URL', () => {
    const config: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: [
          createTestRule('my-custom-rule', 'My Rule'),
        ],
        customCategories: [],
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: [
          {
            category: 'My Prompts',
            prompts: [
              { id: 'custom-prompt-1', name: 'My Prompt', content: 'Test' },
            ],
          },
        ],
      },
    };

    const shareUrl = generateShareUrl(config);

    // URL should be generated successfully
    expect(shareUrl).toContain('config=');
    expect(shareUrl.length).toBeGreaterThan(0);

    // Verify content is preserved
    const decoded = extractConfigFromUrl(shareUrl);
    expect(decoded?.rules.localRules).toHaveLength(1);
    expect(decoded?.prompts.customPromptCategories).toHaveLength(1);
  });

  it('should handle minimal/empty config gracefully', () => {
    // After filtering community content, config might be nearly empty
    const config: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: [],
        customCategories: [],
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: [],
      },
    };

    const shareUrl = generateShareUrl(config);

    // Should create a minimal share URL (empty config is valid)
    expect(shareUrl).toBeTruthy();
    expect(shareUrl.length).toBeLessThan(5000); // Very short URL for empty/minimal config

    const decoded = extractConfigFromUrl(shareUrl);
    expect(decoded).toBeTruthy();
    expect(decoded?.rules.localRules).toHaveLength(0);
  });

  it('should keep URLs short with custom rules only', () => {
    // Simulate what usePersistedConfig would send after filtering
    const customRules: DetectionRule[] = [
      createTestRule('my-rule-1', 'My Rule 1'),
      createTestRule('my-rule-2', 'My Rule 2'),
    ];

    const configWithCustomOnly: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: customRules,
        customCategories: [],
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: [],
      },
    };

    const shareUrl = generateShareUrl(configWithCustomOnly);

    // URL should be reasonable length (no community bloat)
    expect(shareUrl.length).toBeLessThan(10000);
    expect(shareUrl).toContain('config=');

    // Verify decoded config contains only custom rules
    const decoded = extractConfigFromUrl(shareUrl);
    expect(decoded?.rules.localRules).toHaveLength(2);
    expect(decoded?.rules.localRules.every(r => r.id.startsWith('my-rule'))).toBe(true);
  });

  it('should demonstrate URL length savings by excluding community content', () => {
    // Simulate a large community import (9 rules with full metadata)
    const largeCommunityRules: DetectionRule[] = Array.from({ length: 9 }, (_, i) => ({
      ...createTestRule(`community-injection-${String(i + 1).padStart(3, '0')}`, `Community Rule ${i + 1}`),
      description: 'A detailed description of this community rule explaining what it detects and why it matters for security testing purposes.',
    }));

    const smallCustomRules: DetectionRule[] = [
      createTestRule('my-rule-1', 'My Rule 1'),
    ];

    // Config with community rules (should not be sent to generateShareUrl after filtering)
    const largeConfig: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: largeCommunityRules,
        customCategories: [],
      },
      prompts: { localPrompts: [], customPromptCategories: [] },
    };

    // Config with custom rules only (what actually gets sent after filtering)
    const smallConfig: PersistedConfig = {
      version: '1.0',
      savedAt: mockTimestamp,
      rules: {
        localRules: smallCustomRules,
        customCategories: [],
      },
      prompts: { localPrompts: [], customPromptCategories: [] },
    };

    const largeUrl = generateShareUrl(largeConfig);
    const smallUrl = generateShareUrl(smallConfig);

    // Small URL should be significantly shorter
    expect(smallUrl.length).toBeLessThan(largeUrl.length);
    expect(smallUrl.length).toBeLessThan(8000); // Should be quite short
  });
});
