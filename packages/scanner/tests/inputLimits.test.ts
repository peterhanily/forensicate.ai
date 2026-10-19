import { describe, expect, it, vi } from 'vitest';
import { MAX_SCAN_LENGTH, ScanInputTooLargeError, scanPrompt, scanWithCategories } from '../src/scanner.js';
import type { DetectionRule } from '../src/types.js';

describe('complete input contract', () => {
  it('scans the final character at the accepted boundary', () => {
    const rule: DetectionRule = {
      id: 'boundary', name: 'Boundary marker', description: 'Benign completeness fixture',
      type: 'keyword', severity: 'low', enabled: true, keywords: ['Z'],
    };
    const result = scanPrompt('a'.repeat(MAX_SCAN_LENGTH - 1) + 'Z', [rule]);
    expect(result.matchedRules[0].positions).toEqual([{ start: MAX_SCAN_LENGTH - 1, end: MAX_SCAN_LENGTH }]);
  });

  it('rejects oversized input before executing any rules', () => {
    const heuristic = vi.fn(() => ({ matched: false }));
    const rule: DetectionRule = {
      id: 'probe', name: 'Probe', description: 'Execution fixture',
      type: 'heuristic', severity: 'low', enabled: true, heuristic,
    };
    const text = 'a'.repeat(MAX_SCAN_LENGTH + 1);
    expect(() => scanPrompt(text, [rule])).toThrow(ScanInputTooLargeError);
    expect(() => scanPrompt(text, [])).toThrow(expect.objectContaining({
      code: 'INPUT_TOO_LARGE', actualLength: text.length, maxLength: MAX_SCAN_LENGTH,
    }));
    expect(heuristic).not.toHaveBeenCalled();
  });

  it('counts supplementary Unicode characters as two UTF-16 units', () => {
    const atLimit = '😀'.repeat(MAX_SCAN_LENGTH / 2);
    expect(scanPrompt(atLimit, []).totalRulesChecked).toBe(0);
    expect(() => scanPrompt(atLimit + 'a', [])).toThrow(ScanInputTooLargeError);
  });

  it('applies the same rejection to category scans', () => {
    expect(() => scanWithCategories('a'.repeat(MAX_SCAN_LENGTH + 1), [], []))
      .toThrow(ScanInputTooLargeError);
  });
});
