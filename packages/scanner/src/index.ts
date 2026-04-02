// Scanner module exports

export * from './types.js';
export * from './rules.js';
export * from './scanner.js';
export { rehydrateHeuristics, heuristicRules } from './heuristicRules.js';
export { nlpRules, nlpCategory } from './nlpRules.js';
export {
  fileRules, fileRuleCategory, fileHeuristicFunctionMap,
  bidiOverrideDetection, zwcBinaryEncodingDetection,
  normalizationBypassDetection, markdownExfiltrationDetection,
  pdfJavascriptDetection,
} from './fileRules.js';
export { detectCompoundThreats } from './compoundDetector.js';
export {
  computeAttackComplexity,
  getComplexityDescription,
  type AttackComplexityScore,
  type AttackComplexityLabel,
} from './attackComplexity.js';
export {
  fetchCommunityIndex,
  fetchCommunityRule,
  fetchAllCommunityRules,
  communityRuleToDetectionRule,
  clearCommunityCache,
  type CommunityRule,
  type CommunityRuleIndex,
  type CommunityRuleMetadata
} from './communityRules.js';
export {
  fetchCommunityPromptsIndex,
  fetchCommunityPrompt,
  fetchAllCommunityPrompts,
  communityPromptToPromptItem,
  communityPromptsToCategory,
  clearCommunityPromptsCache,
  type CommunityPrompt,
  type CommunityPromptIndex,
  type CommunityPromptMetadata
} from './communityPrompts.js';
