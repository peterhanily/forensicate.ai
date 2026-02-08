import { useState, useEffect, useRef, useCallback } from 'react';
import type { DetectionRule, RuleCategory } from '@forensicate/scanner';
import type { PromptCategory } from '../data/samplePrompts';
import { samplePrompts } from '../data/samplePrompts';
import { allRules, rehydrateHeuristics } from '@forensicate/scanner';
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

  // Meta
  loadSource: LoadSource;
  lastSaved: Date | null;
  error: string | null;

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

// Merge stored rules with current defaults so newly added built-in rules
// appear even when the user has stale localStorage data.
function mergeWithDefaultRules(storedRules: DetectionRule[]): DetectionRule[] {
  const storedIds = new Set(storedRules.map(r => r.id));
  const defaults = getDefaultRules();
  const newBuiltInRules = defaults.filter(r => !storedIds.has(r.id));
  if (newBuiltInRules.length === 0) return storedRules;
  return [...storedRules, ...newBuiltInRules];
}

// Load initial config from URL or localStorage (called once during initialization)
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
} {
  // Priority: URL > localStorage > defaults
  const urlConfig = getConfigFromUrl();
  if (urlConfig) {
    // Clear URL param after reading
    clearUrlConfig();
    // For URL configs, also try to load UI prefs from localStorage
    const storedConfig = loadConfig();

    // Merge URL prompts with defaults (like we do for rules)
    // If URL config has empty localPrompts, use defaults
    // Otherwise merge: keep defaults + add any new categories from URL
    const defaultPrompts = getDefaultPrompts();
    const urlLocalPrompts = urlConfig.prompts.localPrompts || [];
    const mergedPrompts = urlLocalPrompts.length === 0
      ? defaultPrompts
      : defaultPrompts; // Always keep default prompts, extension prompts go to customPromptCategories

    return {
      source: 'url',
      rules: mergeWithDefaultRules(rehydrateHeuristics(urlConfig.rules.localRules)),
      customCategories: urlConfig.rules.customCategories,
      prompts: mergedPrompts,
      customPromptCategories: [
        ...urlConfig.prompts.customPromptCategories,
        ...urlLocalPrompts  // Move extension prompts to custom categories
      ],
      promptText: urlConfig.session?.promptText || '',
      savedAt: new Date(urlConfig.savedAt),
      expandedRuleCategory: storedConfig?.ui?.expandedRuleCategory ?? null,
      expandedPromptCategory: storedConfig?.ui?.expandedPromptCategory ?? null,
      confidenceThreshold: storedConfig?.ui?.confidenceThreshold ?? 50,
    };
  }

  const storedConfig = loadConfig();
  if (storedConfig) {
    return {
      source: 'localStorage',
      rules: mergeWithDefaultRules(rehydrateHeuristics(storedConfig.rules.localRules)),
      customCategories: storedConfig.rules.customCategories,
      prompts: storedConfig.prompts.localPrompts,
      customPromptCategories: storedConfig.prompts.customPromptCategories,
      promptText: '',
      savedAt: new Date(storedConfig.savedAt),
      expandedRuleCategory: storedConfig.ui?.expandedRuleCategory ?? null,
      expandedPromptCategory: storedConfig.ui?.expandedPromptCategory ?? null,
      confidenceThreshold: storedConfig.ui?.confidenceThreshold ?? 50,
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

  // Track if initial load is done (for debounce skip)
  const initialLoadDone = useRef(false);
  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark initial load as done after first render
  useEffect(() => {
    initialLoadDone.current = true;
  }, []);

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
        rules: {
          localRules,
          customCategories,
        },
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
  }, [localRules, customCategories, localPrompts, customPromptCategories, expandedRuleCategory, expandedPromptCategory, confidenceThreshold]);

  const handleGenerateShareUrl = useCallback((promptText?: string): string => {
    const config: PersistedConfig = {
      version: CONFIG_VERSION,
      savedAt: new Date().toISOString(),
      rules: {
        localRules,
        customCategories,
      },
      prompts: {
        localPrompts,
        customPromptCategories,
      },
      // Include session state in share URLs
      session: promptText ? { promptText } : undefined,
    };
    return generateShareUrl(config);
  }, [localRules, customCategories, localPrompts, customPromptCategories]);

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
    loadSource,
    lastSaved,
    error,
    initialPromptText,
    generateShareUrl: handleGenerateShareUrl,
    resetToDefaults,
  };
}
