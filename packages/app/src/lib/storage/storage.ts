import type { PersistedConfig } from './types';

export const STORAGE_KEY = 'forensicate_config';
export const CONFIG_VERSION = '1.0';

/**
 * Save configuration to localStorage
 */
export function saveConfig(config: PersistedConfig): { success: boolean; error?: string } {
  try {
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
    console.warn('[Validate] Config is not an object:', typeof data);
    return false;
  }

  const config = data as Record<string, unknown>;

  // Check version
  if (typeof config.version !== 'string') {
    console.warn('[Validate] Invalid version:', config.version);
    return false;
  }

  // Check savedAt
  if (typeof config.savedAt !== 'string') {
    console.warn('[Validate] Invalid savedAt:', config.savedAt);
    return false;
  }

  // Check rules structure
  if (!config.rules || typeof config.rules !== 'object') {
    console.warn('[Validate] Invalid rules structure:', config.rules);
    return false;
  }
  const rules = config.rules as Record<string, unknown>;
  if (!Array.isArray(rules.localRules) || !Array.isArray(rules.customCategories)) {
    return false;
  }

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
