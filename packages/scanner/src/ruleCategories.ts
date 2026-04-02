// Shared rule-ID-to-category mapping
// Used by attackComplexity.ts and consumed by vaccineGenerator.ts
// to avoid duplicating the same mapping in two places.

/**
 * Maps rule ID prefixes to their logical category.
 * Exact matches are tried first, then longest-prefix matching.
 */
export const RULE_PREFIX_TO_CATEGORY: Record<string, string> = {
  // Keyword rules (exact matches)
  'kw-ignore-instructions': 'instruction-override',
  'kw-new-instructions': 'instruction-override',
  'kw-dan-jailbreak': 'jailbreak',
  'kw-stan-jailbreak': 'jailbreak',
  'kw-dude-jailbreak': 'jailbreak',
  'kw-evil-personas': 'jailbreak',
  'kw-maximum-jailbreak': 'jailbreak',
  'kw-role-manipulation': 'role-manipulation',
  'kw-dual-response': 'role-manipulation',
  'kw-system-prompt': 'prompt-extraction',
  'kw-leak-extraction': 'prompt-extraction',
  'kw-data-exfil-commands': 'exfiltration-supply-chain',
  'kw-safety-probing': 'safety-removal',
  'kw-goal-manipulation': 'compliance-forcing',
  'kw-authority-claims': 'authority-developer',
  'kw-developer-mode': 'authority-developer',
  'kw-context-manipulation': 'context-manipulation',
  'kw-token-manipulation': 'compliance-forcing',
  'kw-hypothetical': 'fiction-hypothetical',
  'kw-fiction-framing': 'fiction-hypothetical',
  'kw-emotional-manipulation': 'persuasion',
  'kw-urgency-pressure': 'persuasion',
  'kw-pliny-patterns': 'jailbreak',
  'kw-crescendo-attack': 'jailbreak',
  'kw-compliance-forcing': 'compliance-forcing',
  'kw-output-bypass': 'safety-removal',
  'kw-threat-consequence': 'threats-consequences',
  'kw-safety-override': 'safety-removal',
  'kw-restriction-removal': 'safety-removal',
  'kw-simulation-framing': 'fiction-hypothetical',
  // Regex and other prefix patterns
  'rx-instruction': 'instruction-override',
  'rx-ignore': 'instruction-override',
  'rx-jailbreak': 'jailbreak',
  'rx-role': 'role-manipulation',
  'rx-persona': 'role-manipulation',
  'rx-system': 'prompt-extraction',
  'rx-leak': 'prompt-extraction',
  'rx-exfil': 'exfiltration-supply-chain',
  'rx-markdown': 'exfiltration-supply-chain',
  'rx-callback': 'exfiltration-supply-chain',
  'rx-safety': 'safety-removal',
  'rx-authority': 'authority-developer',
  'rx-developer': 'authority-developer',
  'rx-context': 'context-manipulation',
  'rx-hypothetical': 'fiction-hypothetical',
  'rx-fiction': 'fiction-hypothetical',
  'rx-simulation': 'fiction-hypothetical',
  'rx-emotional': 'persuasion',
  'rx-urgency': 'persuasion',
  'rx-compliance': 'compliance-forcing',
  'rx-threat': 'threats-consequences',
  'rx-restriction': 'safety-removal',
  'rx-dual': 'role-manipulation',
  'rx-owasp': 'mcp-agent-security',
  'rx-mcp': 'mcp-agent-security',
  'rx-agent': 'mcp-agent-security',
  'rx-tool': 'mcp-agent-security',
  'rx-always': 'mcp-agent-security',
  'rx-ide': 'ide-supply-chain',
  'rx-supply': 'ide-supply-chain',
  'rx-worm': 'worm-propagation',
  'rx-self-rep': 'worm-propagation',
  'rx-rag': 'rag-security',
  'rx-temporal': 'temporal-conditional',
  'rx-delayed': 'temporal-conditional',
  'rx-conditional': 'temporal-conditional',
  'rx-persistence': 'temporal-conditional',
  'rx-output': 'output-forensics',
  'rx-repeated': 'structural',
  'rx-image': 'structural',
  // Heuristic rules
  'heur-entropy': 'encoding-obfuscation',
  'heur-bidi': 'encoding-obfuscation',
  'heur-sneaky': 'encoding-obfuscation',
  'heur-unicode': 'encoding-obfuscation',
  'heur-invisible': 'encoding-obfuscation',
  'heur-lang': 'encoding-obfuscation',
  'heur-homoglyph': 'encoding-obfuscation',
  'heur-evasion': 'encoding-obfuscation',
  'heur-token': 'encoding-obfuscation',
  'heur-structural': 'structural',
  'heur-ratio': 'structural',
  // NLP rules
  'nlp-': 'persuasion',
  // File rules
  'file-': 'structural',
};

/**
 * Infer the logical category for a rule based on its ID.
 * Returns undefined if no category can be inferred.
 */
export function inferCategoryForRule(ruleId: string): string | undefined {
  // Exact match first
  if (RULE_PREFIX_TO_CATEGORY[ruleId]) {
    return RULE_PREFIX_TO_CATEGORY[ruleId];
  }
  // Longest prefix match
  for (const [prefix, category] of Object.entries(RULE_PREFIX_TO_CATEGORY)) {
    if (ruleId.startsWith(prefix)) {
      return category;
    }
  }
  return undefined;
}

/**
 * Infer all unique categories from a list of rule IDs.
 */
export function inferCategoriesFromRules(ruleIds: string[]): Set<string> {
  const categories = new Set<string>();
  for (const id of ruleIds) {
    const cat = inferCategoryForRule(id);
    if (cat) categories.add(cat);
  }
  return categories;
}
