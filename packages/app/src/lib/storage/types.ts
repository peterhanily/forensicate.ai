import type { DetectionRule, RuleCategory } from '@forensicate/scanner';
import type { PromptCategory } from '../../data/samplePrompts';

export interface BuiltInRuleOverride {
  id: string;
  values: Partial<Omit<DetectionRule, 'id' | 'heuristic'>>;
  unset: Array<Exclude<keyof DetectionRule, 'id' | 'heuristic'>>;
  fallback: DetectionRule;
}

export interface PersistedConfig {
  version: string;
  savedAt: string;
  rules: {
    // Version 1 stores full rule snapshots. Version 2 stores custom rules here.
    localRules: DetectionRule[];
    customCategories: RuleCategory[];
    defaultsVersion?: string;
    builtInOverrides?: BuiltInRuleOverride[];
  };
  prompts: {
    localPrompts: PromptCategory[];
    customPromptCategories: PromptCategory[];
  };
  // Current session state (for sharing)
  session?: {
    promptText?: string;
  };
  // UI preferences (persisted locally; only confidenceThreshold is shared)
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
