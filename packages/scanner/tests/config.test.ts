import { describe, it, expect } from 'vitest';
import { parseConfigYaml, applyConfigToRules } from '../src/config';
import type { ForensicateConfig } from '../src/config';
import type { RuleSeverity } from '../src/types';

describe('parseConfigYaml', () => {
  describe('basic key-value parsing', () => {
    it('parses string values', () => {
      const config = parseConfigYaml('output: json');
      expect(config.output).toBe('json');
    });

    it('parses numeric values', () => {
      const config = parseConfigYaml('threshold: 50');
      expect(config.threshold).toBe(50);
    });

    it('parses boolean values', () => {
      const config = parseConfigYaml('fail-on-finding: true');
      expect(config.failOnFinding).toBe(true);
    });

    it('parses false boolean values', () => {
      const config = parseConfigYaml('fail-on-finding: false');
      expect(config.failOnFinding).toBe(false);
    });

    it('converts kebab-case keys to camelCase', () => {
      const config = parseConfigYaml('min-severity: high\nmax-file-size-kb: 500');
      expect(config.minSeverity).toBe('high');
      expect(config.maxFileSizeKb).toBe(500);
    });

    it('parses multiple key-value pairs', () => {
      const yaml = `threshold: 30
output: sarif
scan-mode: changed
fail-on-finding: true`;
      const config = parseConfigYaml(yaml);
      expect(config.threshold).toBe(30);
      expect(config.output).toBe('sarif');
      expect(config.scanMode).toBe('changed');
      expect(config.failOnFinding).toBe(true);
    });
  });

  describe('array parsing', () => {
    it('parses inline arrays with brackets', () => {
      const config = parseConfigYaml('categories: [jailbreak, injection, encoding]');
      expect(config.categories).toEqual(['jailbreak', 'injection', 'encoding']);
    });

    it('parses multi-line arrays with dash syntax', () => {
      const yaml = `categories:
  - jailbreak
  - injection
  - encoding`;
      const config = parseConfigYaml(yaml);
      expect(config.categories).toEqual(['jailbreak', 'injection', 'encoding']);
    });

    it('parses paths array', () => {
      const yaml = `paths:
  - src/**/*.ts
  - prompts/*.txt`;
      const config = parseConfigYaml(yaml);
      expect(config.paths).toEqual(['src/**/*.ts', 'prompts/*.txt']);
    });

    it('parses disable-rules array', () => {
      const yaml = `disable-rules:
  - kw-hypothetical
  - rx-base64-pattern`;
      const config = parseConfigYaml(yaml);
      expect(config.disableRules).toEqual(['kw-hypothetical', 'rx-base64-pattern']);
    });

    it('parses extensions array inline', () => {
      const config = parseConfigYaml('extensions: [.md, .txt, .yaml]');
      expect(config.extensions).toEqual(['.md', '.txt', '.yaml']);
    });

    it('handles empty inline array', () => {
      const config = parseConfigYaml('categories: []');
      // Empty filter results in empty array after validation
      expect(config.categories).toEqual([]);
    });
  });

  describe('comments and whitespace', () => {
    it('ignores comment lines', () => {
      const yaml = `# This is a comment
threshold: 42
# Another comment
output: json`;
      const config = parseConfigYaml(yaml);
      expect(config.threshold).toBe(42);
      expect(config.output).toBe('json');
    });

    it('ignores inline comments', () => {
      const config = parseConfigYaml('threshold: 30 # minimum threshold');
      expect(config.threshold).toBe(30);
    });

    it('ignores empty lines', () => {
      const yaml = `threshold: 25

output: text

fail-on-finding: true`;
      const config = parseConfigYaml(yaml);
      expect(config.threshold).toBe(25);
      expect(config.output).toBe('text');
      expect(config.failOnFinding).toBe(true);
    });

    it('handles leading/trailing empty lines', () => {
      const yaml = `
threshold: 10

`;
      const config = parseConfigYaml(yaml);
      expect(config.threshold).toBe(10);
    });
  });

  describe('quoted strings', () => {
    it('handles double-quoted string values', () => {
      const config = parseConfigYaml('output: "json"');
      expect(config.output).toBe('json');
    });

    it('handles single-quoted string values', () => {
      const config = parseConfigYaml("output: 'sarif'");
      expect(config.output).toBe('sarif');
    });

    it('handles quoted items in inline arrays', () => {
      const config = parseConfigYaml('categories: ["jailbreak", "injection"]');
      expect(config.categories).toEqual(['jailbreak', 'injection']);
    });

    it('handles quoted items in multi-line arrays', () => {
      const yaml = `categories:
  - "jailbreak"
  - 'injection'`;
      const config = parseConfigYaml(yaml);
      expect(config.categories).toEqual(['jailbreak', 'injection']);
    });
  });

  describe('threshold validation and clamping', () => {
    it('accepts threshold within range', () => {
      const config = parseConfigYaml('threshold: 50');
      expect(config.threshold).toBe(50);
    });

    it('clamps threshold to minimum 0', () => {
      const config = parseConfigYaml('threshold: -10');
      expect(config.threshold).toBe(0);
    });

    it('clamps threshold to maximum 99', () => {
      const config = parseConfigYaml('threshold: 150');
      expect(config.threshold).toBe(99);
    });

    it('accepts threshold at boundary 0', () => {
      const config = parseConfigYaml('threshold: 0');
      expect(config.threshold).toBe(0);
    });

    it('accepts threshold at boundary 99', () => {
      const config = parseConfigYaml('threshold: 99');
      expect(config.threshold).toBe(99);
    });

    it('ignores non-numeric threshold', () => {
      const config = parseConfigYaml('threshold: high');
      expect(config.threshold).toBeUndefined();
    });
  });

  describe('severity validation', () => {
    it('accepts valid severities', () => {
      for (const sev of ['low', 'medium', 'high', 'critical']) {
        const config = parseConfigYaml(`min-severity: ${sev}`);
        expect(config.minSeverity).toBe(sev);
      }
    });

    it('rejects invalid severity', () => {
      const config = parseConfigYaml('min-severity: extreme');
      expect(config.minSeverity).toBeUndefined();
    });

    it('rejects numeric severity', () => {
      const config = parseConfigYaml('min-severity: 5');
      expect(config.minSeverity).toBeUndefined();
    });
  });

  describe('output format validation', () => {
    it('accepts valid output formats', () => {
      for (const fmt of ['text', 'json', 'sarif']) {
        const config = parseConfigYaml(`output: ${fmt}`);
        expect(config.output).toBe(fmt);
      }
    });

    it('rejects invalid output format', () => {
      const config = parseConfigYaml('output: xml');
      expect(config.output).toBeUndefined();
    });
  });

  describe('scan mode validation', () => {
    it('accepts valid scan modes', () => {
      for (const mode of ['changed', 'all']) {
        const config = parseConfigYaml(`scan-mode: ${mode}`);
        expect(config.scanMode).toBe(mode);
      }
    });

    it('rejects invalid scan mode', () => {
      const config = parseConfigYaml('scan-mode: incremental');
      expect(config.scanMode).toBeUndefined();
    });
  });

  describe('maxFileSizeKb validation', () => {
    it('accepts valid file size', () => {
      const config = parseConfigYaml('max-file-size-kb: 512');
      expect(config.maxFileSizeKb).toBe(512);
    });

    it('clamps to minimum 1', () => {
      const config = parseConfigYaml('max-file-size-kb: 0');
      expect(config.maxFileSizeKb).toBe(1);
    });

    it('clamps negative values to 1', () => {
      const config = parseConfigYaml('max-file-size-kb: -100');
      expect(config.maxFileSizeKb).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('returns empty config for empty string', () => {
      const config = parseConfigYaml('');
      expect(config).toEqual({});
    });

    it('returns empty config for only comments', () => {
      const config = parseConfigYaml('# just a comment\n# another comment');
      expect(config).toEqual({});
    });

    it('ignores unknown keys', () => {
      const config = parseConfigYaml('unknown-key: value\nthreshold: 10');
      expect(config.threshold).toBe(10);
      expect((config as Record<string, unknown>)['unknownKey']).toBeUndefined();
    });

    it('handles a complete realistic config', () => {
      const yaml = `# Forensicate.ai config
threshold: 40
min-severity: medium
output: sarif
scan-mode: all
fail-on-finding: true
max-file-size-kb: 1024

categories:
  - jailbreak
  - instruction-override
  - encoding-obfuscation

disable-rules:
  - kw-hypothetical
  - rx-base64-pattern

paths:
  - "src/**/*.ts"
  - "prompts/*.txt"

extensions: [.md, .txt, .yaml, .json]`;
      const config = parseConfigYaml(yaml);
      expect(config.threshold).toBe(40);
      expect(config.minSeverity).toBe('medium');
      expect(config.output).toBe('sarif');
      expect(config.scanMode).toBe('all');
      expect(config.failOnFinding).toBe(true);
      expect(config.maxFileSizeKb).toBe(1024);
      expect(config.categories).toEqual(['jailbreak', 'instruction-override', 'encoding-obfuscation']);
      expect(config.disableRules).toEqual(['kw-hypothetical', 'rx-base64-pattern']);
      expect(config.paths).toEqual(['src/**/*.ts', 'prompts/*.txt']);
      expect(config.extensions).toEqual(['.md', '.txt', '.yaml', '.json']);
    });

    it('trailing list is flushed at end of input', () => {
      const yaml = `categories:
  - alpha
  - beta`;
      const config = parseConfigYaml(yaml);
      expect(config.categories).toEqual(['alpha', 'beta']);
    });
  });
});

describe('applyConfigToRules', () => {
  // Helper to build test categories
  function makeCategories(): Array<{ id: string; rules: Array<{ id: string; severity: RuleSeverity; enabled: boolean }> }> {
    return [
      {
        id: 'jailbreak',
        rules: [
          { id: 'kw-dan-jailbreak', severity: 'high', enabled: true },
          { id: 'kw-stan-jailbreak', severity: 'high', enabled: true },
          { id: 'rx-jailbreak-version', severity: 'medium', enabled: true },
        ],
      },
      {
        id: 'instruction-override',
        rules: [
          { id: 'kw-ignore-instructions', severity: 'critical', enabled: true },
          { id: 'rx-instruction-marker', severity: 'high', enabled: true },
          { id: 'kw-new-instructions', severity: 'medium', enabled: true },
        ],
      },
      {
        id: 'encoding-obfuscation',
        rules: [
          { id: 'heur-entropy', severity: 'low', enabled: true },
          { id: 'heur-bidi', severity: 'medium', enabled: true },
          { id: 'rx-base64-pattern', severity: 'low', enabled: false },
        ],
      },
    ];
  }

  it('returns all enabled rules when config is empty', () => {
    const config: ForensicateConfig = {};
    const result = applyConfigToRules(config, makeCategories());
    // 8 enabled rules total (rx-base64-pattern is disabled)
    expect(result.enabledRuleIds.size).toBe(8);
    expect(result.threshold).toBe(0);
  });

  it('filters by category whitelist', () => {
    const config: ForensicateConfig = { categories: ['jailbreak'] };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.has('kw-dan-jailbreak')).toBe(true);
    expect(result.enabledRuleIds.has('kw-stan-jailbreak')).toBe(true);
    expect(result.enabledRuleIds.has('rx-jailbreak-version')).toBe(true);
    // Other categories excluded
    expect(result.enabledRuleIds.has('kw-ignore-instructions')).toBe(false);
    expect(result.enabledRuleIds.has('heur-entropy')).toBe(false);
  });

  it('filters by category blacklist', () => {
    const config: ForensicateConfig = { disableCategories: ['encoding-obfuscation'] };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.has('heur-entropy')).toBe(false);
    expect(result.enabledRuleIds.has('heur-bidi')).toBe(false);
    // Other categories still present
    expect(result.enabledRuleIds.has('kw-dan-jailbreak')).toBe(true);
    expect(result.enabledRuleIds.has('kw-ignore-instructions')).toBe(true);
  });

  it('filters by minimum severity', () => {
    const config: ForensicateConfig = { minSeverity: 'high' };
    const result = applyConfigToRules(config, makeCategories());
    // Only high and critical rules should remain
    expect(result.enabledRuleIds.has('kw-dan-jailbreak')).toBe(true);        // high
    expect(result.enabledRuleIds.has('kw-ignore-instructions')).toBe(true);  // critical
    expect(result.enabledRuleIds.has('rx-instruction-marker')).toBe(true);   // high
    // Medium and low excluded
    expect(result.enabledRuleIds.has('rx-jailbreak-version')).toBe(false);   // medium
    expect(result.enabledRuleIds.has('kw-new-instructions')).toBe(false);    // medium
    expect(result.enabledRuleIds.has('heur-entropy')).toBe(false);           // low
  });

  it('filters by minimum severity critical', () => {
    const config: ForensicateConfig = { minSeverity: 'critical' };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.size).toBe(1);
    expect(result.enabledRuleIds.has('kw-ignore-instructions')).toBe(true);
  });

  it('disables individual rules', () => {
    const config: ForensicateConfig = { disableRules: ['kw-dan-jailbreak', 'heur-entropy'] };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.has('kw-dan-jailbreak')).toBe(false);
    expect(result.enabledRuleIds.has('heur-entropy')).toBe(false);
    // Other rules from same category still present
    expect(result.enabledRuleIds.has('kw-stan-jailbreak')).toBe(true);
  });

  it('respects rule.enabled=false', () => {
    const config: ForensicateConfig = {};
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.has('rx-base64-pattern')).toBe(false);
  });

  it('returns configured threshold', () => {
    const config: ForensicateConfig = { threshold: 42 };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.threshold).toBe(42);
  });

  it('returns default threshold 0 when not configured', () => {
    const config: ForensicateConfig = {};
    const result = applyConfigToRules(config, makeCategories());
    expect(result.threshold).toBe(0);
  });

  it('combines category whitelist with severity filter', () => {
    const config: ForensicateConfig = { categories: ['jailbreak'], minSeverity: 'high' };
    const result = applyConfigToRules(config, makeCategories());
    // Only high+ rules from jailbreak category
    expect(result.enabledRuleIds.has('kw-dan-jailbreak')).toBe(true);
    expect(result.enabledRuleIds.has('kw-stan-jailbreak')).toBe(true);
    expect(result.enabledRuleIds.has('rx-jailbreak-version')).toBe(false); // medium
    expect(result.enabledRuleIds.has('kw-ignore-instructions')).toBe(false); // wrong category
  });

  it('combines blacklist with disable-rules', () => {
    const config: ForensicateConfig = {
      disableCategories: ['encoding-obfuscation'],
      disableRules: ['kw-dan-jailbreak'],
    };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.has('kw-dan-jailbreak')).toBe(false);
    expect(result.enabledRuleIds.has('heur-entropy')).toBe(false);
    expect(result.enabledRuleIds.has('kw-stan-jailbreak')).toBe(true);
  });

  it('returns empty set when whitelist matches no categories', () => {
    const config: ForensicateConfig = { categories: ['nonexistent'] };
    const result = applyConfigToRules(config, makeCategories());
    expect(result.enabledRuleIds.size).toBe(0);
  });

  it('handles empty categories list', () => {
    const config: ForensicateConfig = {};
    const result = applyConfigToRules(config, []);
    expect(result.enabledRuleIds.size).toBe(0);
  });
});
