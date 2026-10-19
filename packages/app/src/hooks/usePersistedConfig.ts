import { useState, useEffect, useRef, useCallback } from 'react';
import type { DetectionRule, RuleCategory } from '@forensicate/scanner';
import type { PromptCategory } from '../data/samplePrompts';
import { samplePrompts } from '../data/samplePrompts';
import { allRules, rehydrateHeuristics } from '@forensicate/scanner';
import { createRulePreferences, resolveRulePreferences } from '../lib/storage/rulePreferences';
import {
  type PersistedConfig,
  type LoadSource,
  CONFIG_VERSION,
  saveConfig,
  loadConfig,
  clearConfig,
  getConfigFromUrl,
  clearUrlConfig,
  generateShareUrl,
} from '../lib/storage';

const DEBOUNCE_MS = 500;

interface UsePersistedConfigReturn {
  // State values
  localRules: DetectionRule[];
  customCategories: RuleCategory[];
  localPrompts: PromptCategory[];
  customPromptCategories: PromptCategory[];

  // Setters
  setLocalRules: React.Dispatch<React.SetStateAction<DetectionRule[]>>;
  setCustomCategories: React.Dispatch<React.SetStateAction<RuleCategory[]>>;
  setLocalPrompts: React.Dispatch<React.SetStateAction<PromptCategory[]>>;
  setCustomPromptCategories: React.Dispatch<React.SetStateAction<PromptCategory[]>>;

  // UI preferences
  expandedRuleCategory: string | null;
  setExpandedRuleCategory: React.Dispatch<React.SetStateAction<string | null>>;
  expandedPromptCategory: string | null;
  setExpandedPromptCategory: React.Dispatch<React.SetStateAction<string | null>>;
  confidenceThreshold: number;
  setConfidenceThreshold: React.Dispatch<React.SetStateAction<number>>;
  autoImportCommunityRules: boolean;
  setAutoImportCommunityRules: React.Dispatch<React.SetStateAction<boolean>>;
  autoImportCommunityPrompts: boolean;
  setAutoImportCommunityPrompts: React.Dispatch<React.SetStateAction<boolean>>;
  tourCompleted: boolean;
  setTourCompleted: React.Dispatch<React.SetStateAction<boolean>>;

  // Meta
  loadSource: LoadSource;
  lastSaved: Date | null;
  error: string | null;
  migrationNotice: string | null;

  // Session state from URL (for sharing)
  initialPromptText: string;

  // Actions
  generateShareUrl: (promptText?: string) => string;
  resetToDefaults: () => void;
}

function getDefaultRules(): DetectionRule[] {
  return rehydrateHeuristics(JSON.parse(JSON.stringify(allRules)));
}

function getDefaultPrompts(): PromptCategory[] {
  return JSON.parse(JSON.stringify(samplePrompts));
}

// Ignore shared or saved thresholds the 0-99 slider cannot produce.
function validThreshold(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 99 ? value : undefined;
}

function resolveSavedRules(config: PersistedConfig) {
  const resolved = resolveRulePreferences(config.rules);
  return {
    rules: resolved.rules,
    migrationNotice: resolved.preservedLegacyEdits > 0
      ? `${resolved.preservedLegacyEdits} saved rule definition${resolved.preservedLegacyEdits === 1 ? ' differs' : 's differ'} from known defaults. Your saved definitions have been kept; review them if you want the latest built-in definitions.`
      : null,
  };
}

// Read initial config without mutating browser state; React may call this twice.
function loadInitialConfig(): {
  source: LoadSource;
  rules: DetectionRule[];
  customCategories: RuleCategory[];
  prompts: PromptCategory[];
  customPromptCategories: PromptCategory[];
  promptText: string;
  savedAt: Date | null;
  expandedRuleCategory: string | null;
  expandedPromptCategory: string | null;
  confidenceThreshold: number;
  autoImportCommunityRules: boolean;
  autoImportCommunityPrompts: boolean;
  tourCompleted: boolean;
  migrationNotice: string | null;
} {
  // Priority: URL > localStorage > defaults
  const urlConfig = getConfigFromUrl();
  if (urlConfig) {
    // For URL configs, also try to load UI prefs from localStorage
    const storedConfig = loadConfig();

    // Keep defaults and place shared extension prompts in custom categories.
    const defaultPrompts = getDefaultPrompts();
    const urlLocalPrompts = urlConfig.prompts.localPrompts || [];

    return {
      source: 'url',
      ...resolveSavedRules(urlConfig),
      customCategories: urlConfig.rules.customCategories,
      prompts: defaultPrompts,
      customPromptCategories: [
        ...urlConfig.prompts.customPromptCategories,
        ...urlLocalPrompts  // Move extension prompts to custom categories
      ],
      promptText: urlConfig.session?.promptText || '',
      savedAt: new Date(urlConfig.savedAt),
      expandedRuleCategory: storedConfig?.ui?.expandedRuleCategory ?? null,
      expandedPromptCategory: storedConfig?.ui?.expandedPromptCategory ?? null,
      confidenceThreshold: validThreshold(urlConfig.ui?.confidenceThreshold)
        ?? validThreshold(storedConfig?.ui?.confidenceThreshold) ?? 50,
      autoImportCommunityRules: storedConfig?.ui?.autoImportCommunityRules ?? true,
      autoImportCommunityPrompts: storedConfig?.ui?.autoImportCommunityPrompts ?? true,
      tourCompleted: storedConfig?.ui?.tourCompleted ?? false,
    };
  }

  const storedConfig = loadConfig();
  if (storedConfig) {
    return {
      source: 'localStorage',
      ...resolveSavedRules(storedConfig),
      customCategories: storedConfig.rules.customCategories,
      prompts: storedConfig.prompts.localPrompts,
      customPromptCategories: storedConfig.prompts.customPromptCategories,
      promptText: '',
      savedAt: new Date(storedConfig.savedAt),
      expandedRuleCategory: storedConfig.ui?.expandedRuleCategory ?? null,
      expandedPromptCategory: storedConfig.ui?.expandedPromptCategory ?? null,
      confidenceThreshold: validThreshold(storedConfig.ui?.confidenceThreshold) ?? 50,
      autoImportCommunityRules: storedConfig.ui?.autoImportCommunityRules ?? true,
      autoImportCommunityPrompts: storedConfig.ui?.autoImportCommunityPrompts ?? true,
      tourCompleted: storedConfig.ui?.tourCompleted ?? false,
    };
  }

  return {
    source: 'defaults',
    rules: getDefaultRules(),
    customCategories: [],
    prompts: getDefaultPrompts(),
    customPromptCategories: [],
    promptText: '',
    savedAt: null,
    expandedRuleCategory: null,
    expandedPromptCategory: null,
    confidenceThreshold: 50,
    autoImportCommunityRules: true,
    autoImportCommunityPrompts: true,
    tourCompleted: false,
    migrationNotice: null,
  };
}

export function usePersistedConfig(): UsePersistedConfigReturn {
  // Load initial config synchronously during first render
  const [initialConfig] = useState(() => loadInitialConfig());

  // Track initialization source
  const [loadSource, setLoadSource] = useState<LoadSource>(initialConfig.source);
  const [lastSaved, setLastSaved] = useState<Date | null>(initialConfig.savedAt);
  const [error, setError] = useState<string | null>(null);

  // Session state loaded from URL (not persisted to localStorage)
  const initialPromptText = initialConfig.promptText;

  // Initialize state with loaded config
  const [localRules, setLocalRules] = useState<DetectionRule[]>(initialConfig.rules);
  const [customCategories, setCustomCategories] = useState<RuleCategory[]>(initialConfig.customCategories);
  const [localPrompts, setLocalPrompts] = useState<PromptCategory[]>(initialConfig.prompts);
  const [customPromptCategories, setCustomPromptCategories] = useState<PromptCategory[]>(initialConfig.customPromptCategories);

  // UI preferences
  const [expandedRuleCategory, setExpandedRuleCategory] = useState<string | null>(initialConfig.expandedRuleCategory);
  const [expandedPromptCategory, setExpandedPromptCategory] = useState<string | null>(initialConfig.expandedPromptCategory);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(initialConfig.confidenceThreshold);
  const [autoImportCommunityRules, setAutoImportCommunityRules] = useState<boolean>(initialConfig.autoImportCommunityRules);
  const [autoImportCommunityPrompts, setAutoImportCommunityPrompts] = useState<boolean>(initialConfig.autoImportCommunityPrompts);
  const [tourCompleted, setTourCompleted] = useState<boolean>(initialConfig.tourCompleted);

  // Track if initial load is done (for debounce skip)
  const initialLoadDone = useRef(false);
  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark initial load as done after first render
  useEffect(() => {
    if (initialConfig.source === 'url') {
      clearUrlConfig();
    }
    initialLoadDone.current = true;
  }, [initialConfig.source]);

  // Auto-save to localStorage on changes (debounced)
  // Note: promptText is NOT saved to localStorage, only to share URLs
  useEffect(() => {
    // Skip if initial load hasn't completed
    if (!initialLoadDone.current) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce save
    saveTimerRef.current = setTimeout(() => {
      const config: PersistedConfig = {
        version: CONFIG_VERSION,
        savedAt: new Date().toISOString(),
        rules: createRulePreferences(localRules, customCategories),
        prompts: {
          localPrompts,
          customPromptCategories,
        },
        // Don't include session state in localStorage saves
        // Include UI preferences
        ui: {
          expandedRuleCategory,
          expandedPromptCategory,
          confidenceThreshold,
          autoImportCommunityRules,
          autoImportCommunityPrompts,
          tourCompleted,
        },
      };

      const result = saveConfig(config);
      if (result.success) {
        setLastSaved(new Date());
        setError(null);
      } else {
        setError(result.error || 'Failed to save');
      }
    }, DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [localRules, customCategories, localPrompts, customPromptCategories, expandedRuleCategory, expandedPromptCategory, confidenceThreshold, autoImportCommunityRules, autoImportCommunityPrompts, tourCompleted]);

  const handleGenerateShareUrl = useCallback((promptText?: string): string => {
    // Preference serialization already omits untouched built-ins. Community
    // rules are fetched by recipients rather than embedded in share links.
    const defaultRuleIds = new Set(allRules.map(r => r.id));
    const rulesToShare = localRules.filter(r =>
      defaultRuleIds.has(r.id) || !r.id.startsWith('community-')
    );

    // Filter out community prompts from custom categories
    // Community prompts have IDs starting with "community-" and will be auto-imported by recipients
    const customPromptsOnly = customPromptCategories.map(category => ({
      ...category,
      prompts: category.prompts.filter(p => !p.id?.startsWith('community-'))
    })).filter(category => category.prompts.length > 0); // Remove empty categories

    const config: PersistedConfig = {
      version: CONFIG_VERSION,
      savedAt: new Date().toISOString(),
      rules: createRulePreferences(rulesToShare, customCategories),
      prompts: {
        localPrompts: [], // Don't include default sample prompts in share URLs
        customPromptCategories: customPromptsOnly,
      },
      // Include session state in share URLs
      session: promptText ? { promptText } : undefined,
      ui: { confidenceThreshold },
    };
    return generateShareUrl(config);
  }, [localRules, customCategories, customPromptCategories, confidenceThreshold]);

  const resetToDefaults = useCallback(() => {
    setLocalRules(getDefaultRules());
    setCustomCategories([]);
    setLocalPrompts(getDefaultPrompts());
    setCustomPromptCategories([]);
    setExpandedRuleCategory(null);
    setExpandedPromptCategory(null);
    setConfidenceThreshold(50);
    clearConfig();
    setLoadSource('defaults');
    setLastSaved(null);
    setError(null);
  }, []);

  return {
    localRules,
    customCategories,
    localPrompts,
    customPromptCategories,
    setLocalRules,
    setCustomCategories,
    setLocalPrompts,
    setCustomPromptCategories,
    expandedRuleCategory,
    setExpandedRuleCategory,
    expandedPromptCategory,
    setExpandedPromptCategory,
    confidenceThreshold,
    setConfidenceThreshold,
    autoImportCommunityRules,
    setAutoImportCommunityRules,
    autoImportCommunityPrompts,
    setAutoImportCommunityPrompts,
    tourCompleted,
    setTourCompleted,
    loadSource,
    lastSaved,
    error,
    migrationNotice: loadSource === 'defaults' ? null : initialConfig.migrationNotice,
    initialPromptText,
    generateShareUrl: handleGenerateShareUrl,
    resetToDefaults,
  };
}
