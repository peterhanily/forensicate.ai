import { describe, expect, it } from 'vitest';
import { scanPrompt } from '../src/scanner';
import type { DetectionRule } from '../src/types';

const baseRule: DetectionRule = {
  id: 'custom-example', name: 'Example', description: 'Benign test rule',
  type: 'keyword', severity: 'low', enabled: true,
};

describe('custom rule iteration', () => {
  it('ignores empty keyword entries while preserving real matches', () => {
    const result = scanPrompt('hello world', [{ ...baseRule, keywords: ['', 'hello'] }]);
    expect(result.matchedRules[0].matches).toEqual(['hello']);
  });

  it('collects every match when a custom regex omits global flags', () => {
    const result = scanPrompt('Hello hello', [{ ...baseRule, type: 'regex', pattern: 'hello', flags: 'i' }]);
    expect(result.matchedRules[0].positions).toEqual([{ start: 0, end: 5 }, { start: 6, end: 11 }]);
  });

  it('advances Unicode empty matches and resets iteration between scans', () => {
    const rule = { ...baseRule, type: 'regex' as const, pattern: '(?=.)', flags: 'u' };
    for (let i = 0; i < 2; i++) {
      const result = scanPrompt('🌼a', [rule]);
      expect(result.matchedRules[0].positions).toEqual([{ start: 0, end: 0 }, { start: 2, end: 2 }]);
    }
  });
});
