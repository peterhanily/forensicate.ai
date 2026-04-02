import { describe, it, expect } from 'vitest';
import { parseYamlRuleFile } from '../src/yamlRules';

describe('parseYamlRuleFile', () => {
  describe('single keyword rule', () => {
    it('parses a basic keyword rule', () => {
      const yaml = `id: my-kw-rule
name: My Keyword Rule
type: keyword
severity: high
keywords:
  - "ignore instructions"
  - "disregard previous"`;

      const result = parseYamlRuleFile(yaml, 'my-kw-rule.yaml');
      expect(result.rules).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);

      const rule = result.rules[0];
      expect(rule.id).toBe('yaml-my-kw-rule');
      expect(rule.name).toBe('My Keyword Rule');
      expect(rule.type).toBe('keyword');
      expect(rule.severity).toBe('high');
      expect(rule.enabled).toBe(true);
      expect(rule.isCustom).toBe(true);
      expect(rule.keywords).toEqual(['ignore instructions', 'disregard previous']);
    });

    it('parses keyword rule with inline array', () => {
      const yaml = `id: inline-kw
name: Inline Keywords
type: keyword
severity: medium
keywords: [override, bypass, ignore]`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].keywords).toEqual(['override', 'bypass', 'ignore']);
    });

    it('sets correct category metadata', () => {
      const yaml = `id: cat-test
name: Category Test Rule
type: keyword
severity: low
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml, 'cat-test.yaml');
      expect(result.category.id).toBe('yaml-cat-test');
      expect(result.category.name).toBe('Category Test Rule');
      expect(result.category.isCustom).toBe(true);
      expect(result.category.source).toBe('cat-test.yaml');
      expect(result.category.rules).toHaveLength(1);
    });
  });

  describe('single regex rule', () => {
    it('parses a basic regex rule', () => {
      const yaml = `id: my-rx-rule
name: My Regex Rule
type: regex
severity: medium
pattern: bypass\\s+safety
flags: gi`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);

      const rule = result.rules[0];
      expect(rule.id).toBe('yaml-my-rx-rule');
      expect(rule.type).toBe('regex');
      expect(rule.pattern).toBe('bypass\\s+safety');
      expect(rule.flags).toBe('gi');
    });

    it('uses default flags gi when not specified', () => {
      const yaml = `id: no-flags
name: No Flags
type: regex
severity: low
pattern: "test pattern"`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].flags).toBe('gi');
    });

    it('accepts description field', () => {
      const yaml = `id: desc-test
name: Description Test
description: This rule detects test patterns
type: regex
severity: low
pattern: "test"`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules[0].description).toBe('This rule detects test patterns');
    });

    it('accepts weight field and clamps it', () => {
      const yaml = `id: weight-test
name: Weight Test
type: regex
severity: low
pattern: "test"
weight: 75`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules[0].weight).toBe(75);
    });
  });

  describe('rule pack with multiple rules', () => {
    it('parses a rule pack with two rules', () => {
      const yaml = `name: My Rule Pack
description: A test pack
rules:
  - id: pack-rule-1
    name: Rule One
    type: regex
    severity: medium
    pattern: "bypass\\\\s+safety"
  - id: pack-rule-2
    name: Rule Two
    type: keyword
    severity: high
    keywords: [override, ignore]`;

      const result = parseYamlRuleFile(yaml, 'my-pack.yaml');
      expect(result.rules).toHaveLength(2);

      expect(result.rules[0].id).toBe('yaml-pack-rule-1');
      expect(result.rules[0].name).toBe('Rule One');
      expect(result.rules[0].type).toBe('regex');

      expect(result.rules[1].id).toBe('yaml-pack-rule-2');
      expect(result.rules[1].name).toBe('Rule Two');
      expect(result.rules[1].type).toBe('keyword');
      expect(result.rules[1].keywords).toEqual(['override', 'ignore']);
    });

    it('sets pack-level category metadata', () => {
      const yaml = `name: Security Pack
description: Custom security rules
rules:
  - id: p1
    name: Test Rule
    type: keyword
    severity: low
    keywords: [test]`;

      const result = parseYamlRuleFile(yaml, 'security.yaml');
      expect(result.category.name).toBe('Security Pack');
      expect(result.category.description).toBe('Custom security rules');
      expect(result.category.isCustom).toBe(true);
    });

    it('uses filename as fallback pack name', () => {
      const yaml = `rules:
  - id: p1
    name: Test Rule
    type: keyword
    severity: low
    keywords: [test]`;

      const result = parseYamlRuleFile(yaml, 'fallback-pack.yml');
      expect(result.category.name).toBe('fallback-pack');
    });
  });

  describe('validation - missing fields', () => {
    it('rejects rule with missing name', () => {
      const yaml = `id: no-name
type: keyword
severity: high
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('missing name'))).toBe(true);
    });

    it('rejects rule with missing type', () => {
      const yaml = `id: no-type
name: No Type Rule
severity: high
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('invalid type'))).toBe(true);
    });

    it('rejects keyword rule with no keywords', () => {
      const yaml = `id: empty-kw
name: Empty Keywords
type: keyword
severity: medium`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('keyword rule must have'))).toBe(true);
    });

    it('rejects regex rule with no pattern', () => {
      const yaml = `id: empty-rx
name: Empty Regex
type: regex
severity: medium`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('regex rule must have a pattern'))).toBe(true);
    });
  });

  describe('validation - invalid type/severity', () => {
    it('rejects invalid rule type', () => {
      const yaml = `id: bad-type
name: Bad Type Rule
type: heuristic
severity: high
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('invalid type'))).toBe(true);
    });

    it('rejects invalid severity', () => {
      const yaml = `id: bad-sev
name: Bad Severity Rule
type: keyword
severity: extreme
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('invalid severity'))).toBe(true);
    });
  });

  describe('validation - invalid regex patterns', () => {
    it('rejects invalid regex syntax', () => {
      const yaml = `id: bad-regex
name: Bad Regex
type: regex
severity: medium
pattern: "[unclosed"`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('invalid regex pattern'))).toBe(true);
    });

    it('rejects nested quantifiers (ReDoS protection) — (a+)+', () => {
      const yaml = `id: redos-1
name: ReDoS Test
type: regex
severity: medium
pattern: "(a+)+"`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('nested quantifiers'))).toBe(true);
    });

    it('rejects nested quantifiers (ReDoS protection) — (a*)*', () => {
      const yaml = `id: redos-2
name: ReDoS Test 2
type: regex
severity: medium
pattern: "(a*)*"`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('nested quantifiers'))).toBe(true);
    });

    it('rejects nested quantifiers with non-capturing group', () => {
      const yaml = `id: redos-3
name: ReDoS Test 3
type: regex
severity: medium
pattern: "(?:a+)+"`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('nested quantifiers'))).toBe(true);
    });
  });

  describe('validation - regex flags', () => {
    it('accepts valid flags', () => {
      const yaml = `id: valid-flags
name: Valid Flags
type: regex
severity: low
pattern: "test"
flags: gim`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].flags).toBe('gim');
    });

    it('rejects invalid flags', () => {
      const yaml = `id: bad-flags
name: Bad Flags
type: regex
severity: low
pattern: "test"
flags: xyz`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('invalid regex flags'))).toBe(true);
    });

    it('accepts all valid flag characters', () => {
      const yaml = `id: all-flags
name: All Flags
type: regex
severity: low
pattern: "test"
flags: gimsuy`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].flags).toBe('gimsuy');
    });
  });

  describe('framework mappings', () => {
    it('parses kill-chain stages', () => {
      const yaml = `id: kc-rule
name: Kill Chain Rule
type: keyword
severity: high
keywords:
  - exfiltrate
kill-chain:
  - initial-access
  - exfiltration`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].killChain).toEqual(['initial-access', 'exfiltration']);
    });

    it('filters invalid kill-chain stages', () => {
      const yaml = `id: kc-invalid
name: Kill Chain Invalid
type: keyword
severity: high
keywords:
  - test
kill-chain:
  - initial-access
  - fake-stage
  - exfiltration`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      // Only valid stages are kept
      expect(result.rules[0].killChain).toEqual(['initial-access', 'exfiltration']);
    });

    it('parses mitre-atlas technique IDs', () => {
      const yaml = `id: atlas-rule
name: MITRE Rule
type: keyword
severity: high
keywords:
  - injection
mitre-atlas:
  - AML.T0051
  - AML.T0054`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].mitreAtlas).toEqual(['AML.T0051', 'AML.T0054']);
    });

    it('filters non-AML mitre-atlas values', () => {
      const yaml = `id: atlas-filter
name: MITRE Filter
type: keyword
severity: high
keywords:
  - test
mitre-atlas:
  - AML.T0051
  - INVALID
  - AML.T0054`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules[0].mitreAtlas).toEqual(['AML.T0051', 'AML.T0054']);
    });

    it('parses eu-ai-act-risk level', () => {
      for (const risk of ['unacceptable', 'high', 'limited', 'minimal']) {
        const yaml = `id: eu-${risk}
name: EU Risk ${risk}
type: keyword
severity: high
keywords:
  - test
eu-ai-act-risk: ${risk}`;

        const result = parseYamlRuleFile(yaml);
        expect(result.rules[0].euAiActRisk).toBe(risk);
      }
    });

    it('ignores invalid eu-ai-act-risk value', () => {
      const yaml = `id: eu-invalid
name: EU Invalid
type: keyword
severity: high
keywords:
  - test
eu-ai-act-risk: extreme`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules[0].euAiActRisk).toBeUndefined();
    });
  });

  describe('warnings for invalid rules in packs', () => {
    it('emits warnings for invalid rules but keeps valid ones', () => {
      const yaml = `name: Mixed Pack
rules:
  - id: valid-rule
    name: Valid Rule
    type: keyword
    severity: medium
    keywords: [test]
  - id: invalid-rule
    type: keyword
    severity: medium
    keywords: [test]
  - id: also-valid
    name: Also Valid
    type: keyword
    severity: low
    keywords: [another]`;

      const result = parseYamlRuleFile(yaml, 'mixed.yaml');
      expect(result.rules).toHaveLength(2);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('missing name'))).toBe(true);
    });

    it('returns all warnings for completely invalid pack', () => {
      const yaml = `name: Bad Pack
rules:
  - id: bad-1
    type: keyword
    severity: medium
  - id: bad-2
    type: regex
    severity: medium`;

      const result = parseYamlRuleFile(yaml, 'bad.yaml');
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles YAML with comments throughout', () => {
      const yaml = `# Rule definition
id: commented-rule # the id
name: Commented Rule # the name
# type of rule
type: keyword
severity: low
# keywords to detect
keywords:
  - "test phrase" # match this`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].name).toBe('Commented Rule');
    });

    it('handles empty YAML input', () => {
      const result = parseYamlRuleFile('');
      expect(result.rules).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('generates fallback ID when none provided', () => {
      const yaml = `name: No ID Rule
type: keyword
severity: low
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].id).toBe('yaml-plugin');
    });

    it('sanitizes filename for category ID', () => {
      const yaml = `id: sanitize-test
name: Sanitize Test
type: keyword
severity: low
keywords:
  - test`;

      const result = parseYamlRuleFile(yaml, 'My Rule File (v2).yaml');
      expect(result.category.id).toBe('yaml-My-Rule-File--v2-');
    });
  });
});
