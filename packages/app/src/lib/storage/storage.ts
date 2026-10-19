import type { PersistedConfig } from './types';
import { isStorableRule, validateRuleOverride } from './rulePreferences';

export const STORAGE_KEY = 'forensicate_config';
export const CONFIG_VERSION = '2.0';
// Browser extension hand-off links write version 1 as '1'.
const supportedVersions = new Set(['1', '1.0', CONFIG_VERSION]);

/**
 * Save configuration to localStorage
 */
export function saveConfig(config: PersistedConfig): { success: boolean; error?: string } {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try {
        const previous = JSON.parse(existing);
        if (typeof previous?.version === 'string' && !supportedVersions.has(previous.version)) {
          return { success: false, error: 'Saved settings use an unsupported version. They have been kept unchanged. Use the matching app version, or reset settings to save new changes.' };
        }
        if (typeof previous?.version === 'string' && !validateConfig(previous)) {
          return { success: false, error: 'Saved settings could not be read. They have been kept unchanged. Reset settings to save new changes.' };
        }
      } catch { /* Invalid JSON does not describe a newer configuration format. */ }
    }
    const serialized = JSON.stringify(config);
    localStorage.setItem(STORAGE_KEY, serialized);
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      // Handle quota exceeded error
      if (error.name === 'QuotaExceededError') {
        return { success: false, error: 'Storage quota exceeded. Data kept in memory.' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to save configuration' };
  }
}

/**
 * Load configuration from localStorage
 */
export function loadConfig(): PersistedConfig | null {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      return null;
    }
    const data = JSON.parse(serialized);
    if (validateConfig(data)) {
      return data;
    }
    console.warn('Invalid config format in localStorage, ignoring');
    return null;
  } catch (error) {
    console.warn('Failed to load config from localStorage:', error);
    return null;
  }
}

/**
 * Validate that data conforms to PersistedConfig structure
 */
export function validateConfig(data: unknown): data is PersistedConfig {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const config = data as Record<string, unknown>;

  // Check version
  if (typeof config.version !== 'string' || !supportedVersions.has(config.version)) {
    return false;
  }

  // Check savedAt
  if (typeof config.savedAt !== 'string') {
    return false;
  }

  // Check rules structure
  if (!config.rules || typeof config.rules !== 'object') {
    return false;
  }
  const rules = config.rules as Record<string, unknown>;
  if (!Array.isArray(rules.localRules) || !Array.isArray(rules.customCategories)) {
    return false;
  }
  if (config.version === CONFIG_VERSION) {
    if (typeof rules.defaultsVersion !== 'string' || !Array.isArray(rules.builtInOverrides)
        || !rules.builtInOverrides.every(validateRuleOverride)) return false;
    const ids = [...rules.localRules.map(rule => rule?.id), ...rules.builtInOverrides.map(override => override.id)];
    if (new Set(ids).size !== ids.length) return false;
  } else if (rules.builtInOverrides !== undefined || rules.defaultsVersion !== undefined) {
    return false;
  }

  // Validate individual rules have required fields
  const allStoredRules = [...rules.localRules,
    ...(Array.isArray(rules.builtInOverrides) ? rules.builtInOverrides.map(override => override.fallback) : []),
  ];
  if (!allStoredRules.every(isStorableRule)) return false;

  // Check prompts structure
  if (!config.prompts || typeof config.prompts !== 'object') {
    return false;
  }
  const prompts = config.prompts as Record<string, unknown>;
  if (!Array.isArray(prompts.localPrompts) || !Array.isArray(prompts.customPromptCategories)) {
    return false;
  }

  return true;
}

/**
 * Clear stored configuration
 */
export function clearConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear config from localStorage:', error);
  }
}
