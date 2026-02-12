import type { DetectionRule, RuleCategory } from '../scanner/types';
import type { PromptCategory } from '../../data/samplePrompts';

export interface PersistedConfig {
  version: string;
  savedAt: string;
  rules: {
    localRules: DetectionRule[];
    customCategories: RuleCategory[];
  };
  prompts: {
    localPrompts: PromptCategory[];
    customPromptCategories: PromptCategory[];
  };
  // Current session state (for sharing)
  session?: {
    promptText?: string;
  };
  // UI preferences (persisted locally, not shared)
  ui?: {
    expandedRuleCategory?: string | null;
    expandedPromptCategory?: string | null;
    confidenceThreshold?: number;
    autoImportCommunityRules?: boolean;
    autoImportCommunityPrompts?: boolean;
    tourCompleted?: boolean;
  };
}

export type LoadSource = 'url' | 'localStorage' | 'defaults';

export interface PersistedConfigMeta {
  loadSource: LoadSource;
  lastSaved: Date | null;
  error: string | null;
}
