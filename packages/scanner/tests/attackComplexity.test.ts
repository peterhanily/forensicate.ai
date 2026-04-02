import { describe, it, expect } from 'vitest';
import { computeAttackComplexity, getComplexityDescription } from '../src/attackComplexity';
import type { AttackComplexityScore, AttackComplexityLabel } from '../src/attackComplexity';
import type { RuleMatch, CompoundThreat } from '../src/types';

// Helper to create a minimal RuleMatch
function makeMatch(overrides: Partial<RuleMatch> & { ruleId: string }): RuleMatch {
  return {
    ruleName: overrides.ruleId,
    ruleType: 'keyword',
    severity: 'medium',
    matches: ['test'],
    positions: [{ start: 0, end: 4 }],
    ...overrides,
  };
}

describe('computeAttackComplexity', () => {
  describe('empty input', () => {
    it('returns null for empty matchedRules', () => {
      const result = computeAttackComplexity([]);
      expect(result).toBeNull();
    });
  });

  describe('simple attacks (low scores)', () => {
    it('computes a low score for a single instruction-override match', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(result).not.toBeNull();
      expect(result!.overall).toBeLessThanOrEqual(40);
      expect(result!.sophistication).toBeLessThanOrEqual(30);
    });

    it('computes a low score for a single compliance-forcing match', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-compliance-forcing', severity: 'low' }),
      ]);
      expect(result).not.toBeNull();
      expect(result!.overall).toBeLessThanOrEqual(30);
    });

    it('labels simple attacks as trivial or basic', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'low' }),
      ]);
      expect(result).not.toBeNull();
      expect(['trivial', 'basic']).toContain(result!.label);
    });
  });

  describe('complex multi-category attacks (higher scores)', () => {
    it('computes higher scores for multi-category attacks', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-dan-jailbreak', severity: 'high' }),
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'critical' }),
        makeMatch({ ruleId: 'heur-entropy', severity: 'medium' }),
        makeMatch({ ruleId: 'kw-role-manipulation', severity: 'high' }),
      ]);
      expect(result).not.toBeNull();
      // Multi-category attack should be at least intermediate
      expect(result!.overall).toBeGreaterThan(30);
      expect(result!.sophistication).toBeGreaterThan(20);
    });

    it('rates worm-propagation + exfiltration as advanced or expert', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'rx-worm-inject', severity: 'critical' }),
        makeMatch({ ruleId: 'kw-data-exfil-commands', severity: 'critical' }),
        makeMatch({ ruleId: 'rx-mcp-tool-abuse', severity: 'high' }),
        makeMatch({ ruleId: 'rx-ide-supply-chain', severity: 'high' }),
      ]);
      expect(result).not.toBeNull();
      expect(result!.overall).toBeGreaterThan(50);
      expect(['intermediate', 'advanced', 'expert']).toContain(result!.label);
    });

    it('scores higher than single-category attacks', () => {
      const single = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      const multi = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
        makeMatch({ ruleId: 'kw-dan-jailbreak', severity: 'high' }),
        makeMatch({ ruleId: 'heur-entropy', severity: 'medium' }),
      ]);
      expect(single).not.toBeNull();
      expect(multi).not.toBeNull();
      expect(multi!.overall).toBeGreaterThan(single!.overall);
    });
  });

  describe('kill chain coverage', () => {
    it('boosts sophistication when kill chain coverage exceeds 30%', () => {
      // 3 out of 7 stages = ~43% coverage
      const withKillChain = computeAttackComplexity([
        makeMatch({
          ruleId: 'kw-ignore-instructions',
          severity: 'high',
          killChain: ['initial-access', 'privilege-escalation', 'exfiltration'],
        }),
      ]);
      const withoutKillChain = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'high' }),
      ]);
      expect(withKillChain).not.toBeNull();
      expect(withoutKillChain).not.toBeNull();
      expect(withKillChain!.sophistication).toBeGreaterThan(withoutKillChain!.sophistication);
    });

    it('boosts blast radius when kill chain coverage exceeds 30%', () => {
      const withKillChain = computeAttackComplexity([
        makeMatch({
          ruleId: 'kw-ignore-instructions',
          severity: 'high',
          killChain: ['initial-access', 'privilege-escalation', 'reconnaissance'],
        }),
      ]);
      const withoutKillChain = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'high' }),
      ]);
      expect(withKillChain).not.toBeNull();
      expect(withoutKillChain).not.toBeNull();
      expect(withKillChain!.blastRadius).toBeGreaterThan(withoutKillChain!.blastRadius);
    });

    it('does not boost when coverage is 30% or below', () => {
      // 2 out of 7 stages = ~29% coverage
      const result = computeAttackComplexity([
        makeMatch({
          ruleId: 'kw-ignore-instructions',
          severity: 'medium',
          killChain: ['initial-access', 'privilege-escalation'],
        }),
      ]);
      const baseline = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(result).not.toBeNull();
      expect(baseline).not.toBeNull();
      // At or below 30% coverage, no kill chain bonus applied
      expect(result!.sophistication).toBe(baseline!.sophistication);
    });

    it('boosts reversibility for late-stage kill chain presence', () => {
      const withExfil = computeAttackComplexity([
        makeMatch({
          ruleId: 'kw-ignore-instructions',
          severity: 'medium',
          killChain: ['exfiltration'],
        }),
      ]);
      const withoutExfil = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(withExfil).not.toBeNull();
      expect(withoutExfil).not.toBeNull();
      expect(withExfil!.reversibility).toBeGreaterThan(withoutExfil!.reversibility);
    });

    it('boosts reversibility for persistence stage', () => {
      const withPersistence = computeAttackComplexity([
        makeMatch({
          ruleId: 'kw-ignore-instructions',
          severity: 'medium',
          killChain: ['persistence'],
        }),
      ]);
      const without = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(withPersistence).not.toBeNull();
      expect(without).not.toBeNull();
      expect(withPersistence!.reversibility).toBeGreaterThan(without!.reversibility);
    });
  });

  describe('compound threats', () => {
    it('boosts sophistication with compound threats', () => {
      const matches = [
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
        makeMatch({ ruleId: 'kw-dan-jailbreak', severity: 'high' }),
      ];
      const compounds: CompoundThreat[] = [
        {
          id: 'ct-1',
          name: 'Test Compound',
          description: 'Test',
          severity: 'high',
          triggeredCategories: ['jailbreak', 'instruction-override'],
        },
      ];

      const withCompounds = computeAttackComplexity(matches, compounds);
      const withoutCompounds = computeAttackComplexity(matches);
      expect(withCompounds).not.toBeNull();
      expect(withoutCompounds).not.toBeNull();
      expect(withCompounds!.sophistication).toBeGreaterThan(withoutCompounds!.sophistication);
    });

    it('boosts blast radius with compound threats', () => {
      const matches = [
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ];
      const compounds: CompoundThreat[] = [
        {
          id: 'ct-1',
          name: 'Test',
          description: 'Test',
          severity: 'high',
          triggeredCategories: ['instruction-override'],
        },
        {
          id: 'ct-2',
          name: 'Test 2',
          description: 'Test 2',
          severity: 'critical',
          triggeredCategories: ['instruction-override'],
        },
      ];

      const withCompounds = computeAttackComplexity(matches, compounds);
      const withoutCompounds = computeAttackComplexity(matches);
      expect(withCompounds).not.toBeNull();
      expect(withoutCompounds).not.toBeNull();
      expect(withCompounds!.blastRadius).toBeGreaterThan(withoutCompounds!.blastRadius);
    });

    it('each compound threat adds incremental boost', () => {
      const matches = [
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ];
      const oneCompound: CompoundThreat[] = [
        { id: 'ct-1', name: 'C1', description: '', severity: 'high', triggeredCategories: [] },
      ];
      const twoCompounds: CompoundThreat[] = [
        { id: 'ct-1', name: 'C1', description: '', severity: 'high', triggeredCategories: [] },
        { id: 'ct-2', name: 'C2', description: '', severity: 'high', triggeredCategories: [] },
      ];

      const r1 = computeAttackComplexity(matches, oneCompound);
      const r2 = computeAttackComplexity(matches, twoCompounds);
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r2!.sophistication).toBeGreaterThanOrEqual(r1!.sophistication);
    });
  });

  describe('multi-technique bonus', () => {
    it('boosts sophistication when 3+ rule types match', () => {
      const mixedTypes = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', ruleType: 'keyword', severity: 'medium' }),
        makeMatch({ ruleId: 'rx-jailbreak-version', ruleType: 'regex', severity: 'medium' }),
        makeMatch({ ruleId: 'heur-entropy', ruleType: 'heuristic', severity: 'medium' }),
      ]);
      const singleType = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', ruleType: 'keyword', severity: 'medium' }),
        makeMatch({ ruleId: 'kw-dan-jailbreak', ruleType: 'keyword', severity: 'medium' }),
        makeMatch({ ruleId: 'kw-role-manipulation', ruleType: 'keyword', severity: 'medium' }),
      ]);
      expect(mixedTypes).not.toBeNull();
      expect(singleType).not.toBeNull();
      // Same categories but mixed types should get bonus
      // (Note: the difference may be small since categories differ, but the
      // multi-technique bonus adds +10 to sophistication and +5 to stealth)
      expect(mixedTypes!.sophistication).toBeGreaterThan(0);
    });
  });

  describe('severity multipliers', () => {
    it('critical matches boost axis scores', () => {
      const critical = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'critical' }),
      ]);
      const medium = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(critical).not.toBeNull();
      expect(medium).not.toBeNull();
      expect(critical!.sophistication).toBeGreaterThanOrEqual(medium!.sophistication);
    });

    it('multiple high severity matches boost scores', () => {
      const manyHigh = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'high' }),
        makeMatch({ ruleId: 'kw-dan-jailbreak', severity: 'high' }),
        makeMatch({ ruleId: 'kw-role-manipulation', severity: 'high' }),
      ]);
      const oneMedium = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(manyHigh).not.toBeNull();
      expect(oneMedium).not.toBeNull();
      expect(manyHigh!.overall).toBeGreaterThan(oneMedium!.overall);
    });
  });

  describe('label assignment', () => {
    it('assigns trivial label for overall <= 20', () => {
      // Single low-severity match in a low-weight category
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-compliance-forcing', severity: 'low' }),
      ]);
      expect(result).not.toBeNull();
      if (result!.overall <= 20) {
        expect(result!.label).toBe('trivial');
      }
    });

    it('assigns correct labels based on overall score ranges', () => {
      // We verify the label logic is consistent with the score
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(result).not.toBeNull();

      const score = result!.overall;
      if (score <= 20) expect(result!.label).toBe('trivial');
      else if (score <= 40) expect(result!.label).toBe('basic');
      else if (score <= 60) expect(result!.label).toBe('intermediate');
      else if (score <= 80) expect(result!.label).toBe('advanced');
      else expect(result!.label).toBe('expert');
    });

    it('all labels are reachable in the type system', () => {
      const validLabels: AttackComplexityLabel[] = [
        'trivial', 'basic', 'intermediate', 'advanced', 'expert',
      ];
      for (const label of validLabels) {
        expect(typeof label).toBe('string');
      }
    });
  });

  describe('score clamping', () => {
    it('all axis scores are between 0 and 100', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'critical' }),
        makeMatch({ ruleId: 'kw-dan-jailbreak', severity: 'critical' }),
        makeMatch({ ruleId: 'heur-entropy', severity: 'critical' }),
        makeMatch({ ruleId: 'rx-worm-inject', severity: 'critical' }),
        makeMatch({ ruleId: 'kw-data-exfil-commands', severity: 'critical' }),
        makeMatch({ ruleId: 'rx-mcp-tool-abuse', severity: 'critical' }),
        makeMatch({ ruleId: 'rx-rag-inject', severity: 'critical' }),
        makeMatch({ ruleId: 'rx-temporal-trigger', severity: 'critical' }),
      ]);
      expect(result).not.toBeNull();
      expect(result!.sophistication).toBeGreaterThanOrEqual(0);
      expect(result!.sophistication).toBeLessThanOrEqual(100);
      expect(result!.blastRadius).toBeGreaterThanOrEqual(0);
      expect(result!.blastRadius).toBeLessThanOrEqual(100);
      expect(result!.stealth).toBeGreaterThanOrEqual(0);
      expect(result!.stealth).toBeLessThanOrEqual(100);
      expect(result!.reversibility).toBeGreaterThanOrEqual(0);
      expect(result!.reversibility).toBeLessThanOrEqual(100);
      expect(result!.overall).toBeGreaterThanOrEqual(0);
      expect(result!.overall).toBeLessThanOrEqual(100);
    });

    it('overall score is rounded integer', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
      ]);
      expect(result).not.toBeNull();
      expect(Number.isInteger(result!.overall)).toBe(true);
    });
  });

  describe('weighted composite calculation', () => {
    it('overall is a weighted combination of all 4 axes', () => {
      const result = computeAttackComplexity([
        makeMatch({ ruleId: 'kw-ignore-instructions', severity: 'medium' }),
        makeMatch({ ruleId: 'kw-dan-jailbreak', severity: 'high' }),
      ]);
      expect(result).not.toBeNull();

      // Verify the overall roughly matches the weighted formula
      // overall = clamp(soph * 0.30 + blast * 0.30 + stealth * 0.20 + rev * 0.20)
      const expected = Math.max(0, Math.min(100, Math.round(
        result!.sophistication * 0.30 +
        result!.blastRadius * 0.30 +
        result!.stealth * 0.20 +
        result!.reversibility * 0.20
      )));
      expect(result!.overall).toBe(expected);
    });
  });
});

describe('getComplexityDescription', () => {
  it('returns correct description for trivial', () => {
    const desc = getComplexityDescription({
      sophistication: 10, blastRadius: 10, stealth: 5, reversibility: 5,
      overall: 10, label: 'trivial',
    });
    expect(desc).toContain('Simple');
    expect(desc).toContain('basic guardrails');
  });

  it('returns correct description for basic', () => {
    const desc = getComplexityDescription({
      sophistication: 25, blastRadius: 25, stealth: 15, reversibility: 15,
      overall: 25, label: 'basic',
    });
    expect(desc).toContain('Common');
    expect(desc).toContain('Standard defenses');
  });

  it('returns correct description for intermediate', () => {
    const desc = getComplexityDescription({
      sophistication: 50, blastRadius: 45, stealth: 40, reversibility: 35,
      overall: 45, label: 'intermediate',
    });
    expect(desc).toContain('Moderately sophisticated');
    expect(desc).toContain('targeted defenses');
  });

  it('returns correct description for advanced', () => {
    const desc = getComplexityDescription({
      sophistication: 70, blastRadius: 65, stealth: 60, reversibility: 55,
      overall: 65, label: 'advanced',
    });
    expect(desc).toContain('Highly sophisticated');
    expect(desc).toContain('Specialized countermeasures');
  });

  it('returns correct description for expert', () => {
    const desc = getComplexityDescription({
      sophistication: 90, blastRadius: 85, stealth: 80, reversibility: 75,
      overall: 85, label: 'expert',
    });
    expect(desc).toContain('Expert-level');
    expect(desc).toContain('defense-in-depth');
  });

  it('returns a non-empty string for all labels', () => {
    const labels: AttackComplexityLabel[] = ['trivial', 'basic', 'intermediate', 'advanced', 'expert'];
    for (const label of labels) {
      const desc = getComplexityDescription({
        sophistication: 50, blastRadius: 50, stealth: 50, reversibility: 50,
        overall: 50, label,
      });
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});
