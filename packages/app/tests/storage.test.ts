import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  STORAGE_KEY,
  saveConfig,
  loadConfig,
  validateConfig,
  clearConfig,
} from '../src/lib/storage/storage';
import {
  encodeConfig,
  decodeConfig,
  getConfigFromUrl,
  clearUrlConfig,
  generateShareUrl,
} from '../src/lib/storage/urlHash';
import type { PersistedConfig } from '../src/lib/storage/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Sample config for testing
const sampleConfig: PersistedConfig = {
  version: '1.0',
  savedAt: '2024-01-01T00:00:00.000Z',
  rules: {
    localRules: [
      {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test rule',
        type: 'keyword',
        severity: 'high',
        enabled: true,
        keywords: ['test'],
      },
    ],
    customCategories: [],
  },
  prompts: {
    localPrompts: [
      {
        id: 'test-category',
        name: 'Test Category',
        description: 'Test',
        source: 'test',
        prompts: [],
      },
    ],
    customPromptCategories: [],
  },
};

describe('storage.ts', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('saveConfig', () => {
    it('saves config to localStorage', () => {
      const result = saveConfig(sampleConfig);

      expect(result.success).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(sampleConfig)
      );
    });

    it('returns error on quota exceeded', () => {
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw quotaError;
      });

      const result = saveConfig(sampleConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('quota');
    });
  });

  describe('loadConfig', () => {
    it('returns null when no config stored', () => {
      const result = loadConfig();
      expect(result).toBeNull();
    });

    it('loads valid config from localStorage', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(sampleConfig));

      const result = loadConfig();

      expect(result).toEqual(sampleConfig);
    });

    it('returns null for invalid JSON', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json');

      const result = loadConfig();

      expect(result).toBeNull();
    });

    it('returns null for invalid config structure', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ foo: 'bar' }));

      const result = loadConfig();

      expect(result).toBeNull();
    });
  });

  describe('validateConfig', () => {
    it('returns true for valid config', () => {
      expect(validateConfig(sampleConfig)).toBe(true);
    });

    it('returns false for null', () => {
      expect(validateConfig(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(validateConfig('string')).toBe(false);
    });

    it('returns false for missing version', () => {
      const invalid = { ...sampleConfig, version: undefined };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('returns false for missing savedAt', () => {
      const invalid = { ...sampleConfig, savedAt: undefined };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('returns false for missing rules', () => {
      const invalid = { ...sampleConfig, rules: undefined };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('returns false for missing prompts', () => {
      const invalid = { ...sampleConfig, prompts: undefined };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('returns false for invalid localRules type', () => {
      const invalid = {
        ...sampleConfig,
        rules: { ...sampleConfig.rules, localRules: 'not an array' },
      };
      expect(validateConfig(invalid)).toBe(false);
    });
  });

  describe('clearConfig', () => {
    it('removes config from localStorage', () => {
      clearConfig();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });
});

describe('urlHash.ts', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Mock window.location
    delete (window as { location?: Location }).location;
    window.location = {
      ...originalLocation,
      hash: '',
      search: '',
      href: 'http://localhost:3000/',
    } as Location;

    // Mock history.replaceState
    window.history.replaceState = vi.fn();
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  describe('encodeConfig', () => {
    it('encodes config to URL-safe base64', () => {
      const encoded = encodeConfig(sampleConfig);

      // Should not contain standard base64 chars that are URL-unsafe
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('produces decodable output', () => {
      const encoded = encodeConfig(sampleConfig);
      const decoded = decodeConfig(encoded);

      expect(decoded).toEqual(sampleConfig);
    });
  });

  describe('decodeConfig', () => {
    it('decodes valid encoded string to config', () => {
      const encoded = encodeConfig(sampleConfig);
      const result = decodeConfig(encoded);

      expect(result).toEqual(sampleConfig);
    });

    it('returns null for invalid base64', () => {
      const result = decodeConfig('!!!invalid!!!');
      expect(result).toBeNull();
    });

    it('returns null for valid base64 with invalid config', () => {
      // Encode a non-config object
      const invalidConfig = btoa(JSON.stringify({ foo: 'bar' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const result = decodeConfig(invalidConfig);
      expect(result).toBeNull();
    });
  });

  describe('getConfigFromUrl', () => {
    it('returns null when no config param', () => {
      window.location.hash = '';
      window.location.search = '';
      const result = getConfigFromUrl();
      expect(result).toBeNull();
    });

    it('returns config from hash query params (HashRouter)', () => {
      const encoded = encodeConfig(sampleConfig);
      window.location.hash = `#/scanner?config=${encoded}`;

      const result = getConfigFromUrl();

      expect(result).toEqual(sampleConfig);
    });

    it('returns config from search params (BrowserRouter)', () => {
      const encoded = encodeConfig(sampleConfig);
      window.location.search = `?config=${encoded}`;

      const result = getConfigFromUrl();

      expect(result).toEqual(sampleConfig);
    });
  });

  describe('clearUrlConfig', () => {
    it('clears config from hash query params', () => {
      const encoded = encodeConfig(sampleConfig);
      window.location.hash = `#/scanner?config=${encoded}`;
      window.location.href = `http://localhost:3000/#/scanner?config=${encoded}`;

      clearUrlConfig();

      expect(window.history.replaceState).toHaveBeenCalled();
    });

    it('clears config from search params', () => {
      const encoded = encodeConfig(sampleConfig);
      window.location.search = `?config=${encoded}`;
      window.location.href = `http://localhost:3000/scanner?config=${encoded}`;

      clearUrlConfig();

      expect(window.history.replaceState).toHaveBeenCalled();
    });

    it('does nothing when no config param', () => {
      window.location.hash = '#/scanner';
      window.location.search = '';

      clearUrlConfig();

      expect(window.history.replaceState).not.toHaveBeenCalled();
    });
  });

  describe('generateShareUrl', () => {
    it('generates URL with hash query for HashRouter', () => {
      window.location.hash = '#/scanner';
      window.location.href = 'http://localhost:3000/#/scanner';

      const url = generateShareUrl(sampleConfig);

      expect(url).toContain('#/scanner?config=');
    });

    it('generates URL with search params for BrowserRouter', () => {
      window.location.hash = '';
      window.location.href = 'http://localhost:3000/scanner';

      const url = generateShareUrl(sampleConfig);

      expect(url).toContain('?config=');
      expect(url).not.toContain('#');
    });

    it('includes session promptText when provided', () => {
      window.location.href = 'http://localhost:3000/scanner';

      const configWithSession: PersistedConfig = {
        ...sampleConfig,
        session: { promptText: 'test prompt' },
      };
      const url = generateShareUrl(configWithSession);
      // Use URL API to properly extract the encoded config param
      const urlObj = new URL(url);
      const encoded = urlObj.searchParams.get('config');
      expect(encoded).not.toBeNull();
      const decoded = decodeConfig(encoded!);

      expect(decoded?.session?.promptText).toBe('test prompt');
    });
  });
});
