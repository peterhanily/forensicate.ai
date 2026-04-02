import { describe, it, expect } from 'vitest';
import {
  inferCategoryForRule,
  inferCategoriesFromRules,
  RULE_PREFIX_TO_CATEGORY,
} from '../src/ruleCategories';

describe('inferCategoryForRule', () => {
  describe('exact matches for keyword rules', () => {
    it('maps kw-dan-jailbreak to jailbreak', () => {
      expect(inferCategoryForRule('kw-dan-jailbreak')).toBe('jailbreak');
    });

    it('maps kw-stan-jailbreak to jailbreak', () => {
      expect(inferCategoryForRule('kw-stan-jailbreak')).toBe('jailbreak');
    });

    it('maps kw-ignore-instructions to instruction-override', () => {
      expect(inferCategoryForRule('kw-ignore-instructions')).toBe('instruction-override');
    });

    it('maps kw-new-instructions to instruction-override', () => {
      expect(inferCategoryForRule('kw-new-instructions')).toBe('instruction-override');
    });

    it('maps kw-role-manipulation to role-manipulation', () => {
      expect(inferCategoryForRule('kw-role-manipulation')).toBe('role-manipulation');
    });

    it('maps kw-system-prompt to prompt-extraction', () => {
      expect(inferCategoryForRule('kw-system-prompt')).toBe('prompt-extraction');
    });

    it('maps kw-data-exfil-commands to exfiltration-supply-chain', () => {
      expect(inferCategoryForRule('kw-data-exfil-commands')).toBe('exfiltration-supply-chain');
    });

    it('maps kw-safety-probing to safety-removal', () => {
      expect(inferCategoryForRule('kw-safety-probing')).toBe('safety-removal');
    });

    it('maps kw-authority-claims to authority-developer', () => {
      expect(inferCategoryForRule('kw-authority-claims')).toBe('authority-developer');
    });

    it('maps kw-hypothetical to fiction-hypothetical', () => {
      expect(inferCategoryForRule('kw-hypothetical')).toBe('fiction-hypothetical');
    });

    it('maps kw-emotional-manipulation to persuasion', () => {
      expect(inferCategoryForRule('kw-emotional-manipulation')).toBe('persuasion');
    });

    it('maps kw-threat-consequence to threats-consequences', () => {
      expect(inferCategoryForRule('kw-threat-consequence')).toBe('threats-consequences');
    });

    it('maps kw-compliance-forcing to compliance-forcing', () => {
      expect(inferCategoryForRule('kw-compliance-forcing')).toBe('compliance-forcing');
    });

    it('maps kw-context-manipulation to context-manipulation', () => {
      expect(inferCategoryForRule('kw-context-manipulation')).toBe('context-manipulation');
    });

    it('maps kw-pliny-patterns to jailbreak', () => {
      expect(inferCategoryForRule('kw-pliny-patterns')).toBe('jailbreak');
    });

    it('maps kw-developer-mode to authority-developer', () => {
      expect(inferCategoryForRule('kw-developer-mode')).toBe('authority-developer');
    });
  });

  describe('prefix matches for regex rules', () => {
    it('maps rx-instruction-* to instruction-override', () => {
      expect(inferCategoryForRule('rx-instruction-marker')).toBe('instruction-override');
      expect(inferCategoryForRule('rx-instruction-override')).toBe('instruction-override');
    });

    it('maps rx-ignore-* to instruction-override', () => {
      expect(inferCategoryForRule('rx-ignore-previous')).toBe('instruction-override');
    });

    it('maps rx-jailbreak-* to jailbreak', () => {
      expect(inferCategoryForRule('rx-jailbreak-version')).toBe('jailbreak');
      expect(inferCategoryForRule('rx-jailbreak-dan')).toBe('jailbreak');
    });

    it('maps rx-role-* to role-manipulation', () => {
      expect(inferCategoryForRule('rx-role-play')).toBe('role-manipulation');
    });

    it('maps rx-persona-* to role-manipulation', () => {
      expect(inferCategoryForRule('rx-persona-switch')).toBe('role-manipulation');
    });

    it('maps rx-system-* to prompt-extraction', () => {
      expect(inferCategoryForRule('rx-system-prompt-leak')).toBe('prompt-extraction');
    });

    it('maps rx-exfil-* to exfiltration-supply-chain', () => {
      expect(inferCategoryForRule('rx-exfil-url')).toBe('exfiltration-supply-chain');
    });

    it('maps rx-markdown-* to exfiltration-supply-chain', () => {
      expect(inferCategoryForRule('rx-markdown-injection')).toBe('exfiltration-supply-chain');
    });

    it('maps rx-safety-* to safety-removal', () => {
      expect(inferCategoryForRule('rx-safety-bypass')).toBe('safety-removal');
    });

    it('maps rx-authority-* to authority-developer', () => {
      expect(inferCategoryForRule('rx-authority-claim')).toBe('authority-developer');
    });

    it('maps rx-developer-* to authority-developer', () => {
      expect(inferCategoryForRule('rx-developer-mode')).toBe('authority-developer');
    });

    it('maps rx-hypothetical-* to fiction-hypothetical', () => {
      expect(inferCategoryForRule('rx-hypothetical-scenario')).toBe('fiction-hypothetical');
    });

    it('maps rx-fiction-* to fiction-hypothetical', () => {
      expect(inferCategoryForRule('rx-fiction-framing')).toBe('fiction-hypothetical');
    });

    it('maps rx-simulation-* to fiction-hypothetical', () => {
      expect(inferCategoryForRule('rx-simulation-mode')).toBe('fiction-hypothetical');
    });

    it('maps rx-emotional-* to persuasion', () => {
      expect(inferCategoryForRule('rx-emotional-appeal')).toBe('persuasion');
    });

    it('maps rx-urgency-* to persuasion', () => {
      expect(inferCategoryForRule('rx-urgency-pressure')).toBe('persuasion');
    });

    it('maps rx-compliance-* to compliance-forcing', () => {
      expect(inferCategoryForRule('rx-compliance-demand')).toBe('compliance-forcing');
    });

    it('maps rx-threat-* to threats-consequences', () => {
      expect(inferCategoryForRule('rx-threat-warning')).toBe('threats-consequences');
    });

    it('maps rx-restriction-* to safety-removal', () => {
      expect(inferCategoryForRule('rx-restriction-bypass')).toBe('safety-removal');
    });

    it('maps rx-owasp-* to mcp-agent-security', () => {
      expect(inferCategoryForRule('rx-owasp-llm01')).toBe('mcp-agent-security');
    });

    it('maps rx-mcp-* to mcp-agent-security', () => {
      expect(inferCategoryForRule('rx-mcp-tool-abuse')).toBe('mcp-agent-security');
    });

    it('maps rx-agent-* to mcp-agent-security', () => {
      expect(inferCategoryForRule('rx-agent-hijack')).toBe('mcp-agent-security');
    });

    it('maps rx-tool-* to mcp-agent-security', () => {
      expect(inferCategoryForRule('rx-tool-misuse')).toBe('mcp-agent-security');
    });

    it('maps rx-ide-* to ide-supply-chain', () => {
      expect(inferCategoryForRule('rx-ide-supply-chain')).toBe('ide-supply-chain');
    });

    it('maps rx-supply-* to ide-supply-chain', () => {
      expect(inferCategoryForRule('rx-supply-chain-attack')).toBe('ide-supply-chain');
    });

    it('maps rx-worm-* to worm-propagation', () => {
      expect(inferCategoryForRule('rx-worm-inject')).toBe('worm-propagation');
    });

    it('maps rx-self-rep-* to worm-propagation', () => {
      expect(inferCategoryForRule('rx-self-rep-pattern')).toBe('worm-propagation');
    });

    it('maps rx-rag-* to rag-security', () => {
      expect(inferCategoryForRule('rx-rag-inject')).toBe('rag-security');
    });

    it('maps rx-temporal-* to temporal-conditional', () => {
      expect(inferCategoryForRule('rx-temporal-trigger')).toBe('temporal-conditional');
    });

    it('maps rx-delayed-* to temporal-conditional', () => {
      expect(inferCategoryForRule('rx-delayed-execution')).toBe('temporal-conditional');
    });

    it('maps rx-conditional-* to temporal-conditional', () => {
      expect(inferCategoryForRule('rx-conditional-trigger')).toBe('temporal-conditional');
    });

    it('maps rx-persistence-* to temporal-conditional', () => {
      expect(inferCategoryForRule('rx-persistence-inject')).toBe('temporal-conditional');
    });

    it('maps rx-output-* to output-forensics', () => {
      expect(inferCategoryForRule('rx-output-marker')).toBe('output-forensics');
    });

    it('maps rx-repeated-* to structural', () => {
      expect(inferCategoryForRule('rx-repeated-chars')).toBe('structural');
    });

    it('maps rx-callback-* to exfiltration-supply-chain', () => {
      expect(inferCategoryForRule('rx-callback-url')).toBe('exfiltration-supply-chain');
    });
  });

  describe('heuristic rule prefixes', () => {
    it('maps heur-entropy to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-entropy')).toBe('encoding-obfuscation');
    });

    it('maps heur-bidi to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-bidi')).toBe('encoding-obfuscation');
    });

    it('maps heur-sneaky to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-sneaky')).toBe('encoding-obfuscation');
    });

    it('maps heur-unicode to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-unicode')).toBe('encoding-obfuscation');
    });

    it('maps heur-invisible to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-invisible')).toBe('encoding-obfuscation');
    });

    it('maps heur-lang to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-lang')).toBe('encoding-obfuscation');
    });

    it('maps heur-homoglyph to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-homoglyph')).toBe('encoding-obfuscation');
    });

    it('maps heur-evasion to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-evasion')).toBe('encoding-obfuscation');
    });

    it('maps heur-token to encoding-obfuscation', () => {
      expect(inferCategoryForRule('heur-token')).toBe('encoding-obfuscation');
    });

    it('maps heur-structural to structural', () => {
      expect(inferCategoryForRule('heur-structural')).toBe('structural');
    });

    it('maps heur-ratio to structural', () => {
      expect(inferCategoryForRule('heur-ratio')).toBe('structural');
    });
  });

  describe('NLP rule prefix', () => {
    it('maps nlp-* to persuasion', () => {
      expect(inferCategoryForRule('nlp-sentiment')).toBe('persuasion');
      expect(inferCategoryForRule('nlp-imperative')).toBe('persuasion');
      expect(inferCategoryForRule('nlp-named-entity')).toBe('persuasion');
    });
  });

  describe('file rule prefix', () => {
    it('maps file-* to structural', () => {
      expect(inferCategoryForRule('file-hidden-text')).toBe('structural');
      expect(inferCategoryForRule('file-metadata')).toBe('structural');
      expect(inferCategoryForRule('file-steganographic')).toBe('structural');
    });
  });

  describe('unknown rule IDs', () => {
    it('returns undefined for completely unknown IDs', () => {
      expect(inferCategoryForRule('unknown-rule')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(inferCategoryForRule('')).toBeUndefined();
    });

    it('returns undefined for random prefix', () => {
      expect(inferCategoryForRule('foo-bar-baz')).toBeUndefined();
    });

    it('returns undefined for partial matches that do not match any prefix', () => {
      expect(inferCategoryForRule('kw-')).toBeUndefined();
    });
  });
});

describe('inferCategoriesFromRules', () => {
  it('returns empty set for empty input', () => {
    const result = inferCategoriesFromRules([]);
    expect(result.size).toBe(0);
  });

  it('returns single category for one rule', () => {
    const result = inferCategoriesFromRules(['kw-dan-jailbreak']);
    expect(result.size).toBe(1);
    expect(result.has('jailbreak')).toBe(true);
  });

  it('deduplicates rules mapping to the same category', () => {
    const result = inferCategoriesFromRules([
      'kw-dan-jailbreak',
      'kw-stan-jailbreak',
      'kw-evil-personas',
      'rx-jailbreak-version',
    ]);
    expect(result.size).toBe(1);
    expect(result.has('jailbreak')).toBe(true);
  });

  it('returns multiple categories for diverse rules', () => {
    const result = inferCategoriesFromRules([
      'kw-dan-jailbreak',        // jailbreak
      'kw-ignore-instructions',  // instruction-override
      'heur-entropy',            // encoding-obfuscation
      'nlp-sentiment',           // persuasion
      'file-hidden-text',        // structural
    ]);
    expect(result.size).toBe(5);
    expect(result.has('jailbreak')).toBe(true);
    expect(result.has('instruction-override')).toBe(true);
    expect(result.has('encoding-obfuscation')).toBe(true);
    expect(result.has('persuasion')).toBe(true);
    expect(result.has('structural')).toBe(true);
  });

  it('skips unknown rule IDs without error', () => {
    const result = inferCategoriesFromRules([
      'kw-dan-jailbreak',
      'unknown-rule',
      'another-unknown',
    ]);
    expect(result.size).toBe(1);
    expect(result.has('jailbreak')).toBe(true);
  });

  it('returns empty set when all rules are unknown', () => {
    const result = inferCategoriesFromRules(['foo', 'bar', 'baz']);
    expect(result.size).toBe(0);
  });
});

describe('RULE_PREFIX_TO_CATEGORY mapping completeness', () => {
  it('has entries for all major rule prefixes', () => {
    const prefixes = ['kw-', 'rx-', 'heur-', 'nlp-', 'file-'];
    for (const prefix of prefixes) {
      const hasPrefix = Object.keys(RULE_PREFIX_TO_CATEGORY).some(k => k.startsWith(prefix));
      expect(hasPrefix).toBe(true);
    }
  });

  it('all category values are non-empty strings', () => {
    for (const [key, value] of Object.entries(RULE_PREFIX_TO_CATEGORY)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('contains expected high-value categories', () => {
    const expectedCategories = [
      'jailbreak',
      'instruction-override',
      'role-manipulation',
      'prompt-extraction',
      'exfiltration-supply-chain',
      'safety-removal',
      'encoding-obfuscation',
      'mcp-agent-security',
      'worm-propagation',
      'rag-security',
      'temporal-conditional',
    ];
    const allCategories = new Set(Object.values(RULE_PREFIX_TO_CATEGORY));
    for (const cat of expectedCategories) {
      expect(allCategories.has(cat)).toBe(true);
    }
  });
});
