import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedConfig } from '../src/hooks/usePersistedConfig';
import { STORAGE_KEY } from '../src/lib/storage/storage';
import { encodeConfig } from '../src/lib/storage/urlHash';
import type { PersistedConfig } from '../src/lib/storage/types';

// Mock localStorage
const createLocalStorageMock = () => {
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
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore;
    },
  };
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location
const originalLocation = window.location;

describe('usePersistedConfig', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset window.location
    delete (window as { location?: Location }).location;
    window.location = {
      ...originalLocation,
      hash: '',
      search: '',
      href: 'http://localhost:3000/',
    } as Location;
    window.history.replaceState = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.location = originalLocation;
  });

  it('loads defaults when no config exists', () => {
    const { result } = renderHook(() => usePersistedConfig());

    expect(result.current.loadSource).toBe('defaults');
    expect(result.current.localRules.length).toBeGreaterThan(0);
    expect(result.current.localPrompts.length).toBeGreaterThan(0);
    expect(result.current.customCategories).toEqual([]);
    expect(result.current.customPromptCategories).toEqual([]);
  });

  it('has default confidence threshold of 50', () => {
    const { result } = renderHook(() => usePersistedConfig());
    expect(result.current.confidenceThreshold).toBe(50);
  });

  it('loads config from localStorage when available', async () => {
    const storedConfig: PersistedConfig = {
      version: '1.0',
      savedAt: '2024-01-01T00:00:00.000Z',
      rules: {
        localRules: [
          {
            id: 'test-rule',
            name: 'Test Rule',
            description: 'Test',
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
            name: 'Test',
            description: 'Test',
            source: 'test',
            prompts: [],
          },
        ],
        customPromptCategories: [],
      },
    };

    localStorageMock._setStore({
      [STORAGE_KEY]: JSON.stringify(storedConfig),
    });
    localStorageMock.getItem.mockImplementation((key: string) => {
      return localStorageMock._getStore()[key] || null;
    });

    const { result } = renderHook(() => usePersistedConfig());

    // Wait for state to settle - wrap in act() to handle state updates
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loadSource).toBe('localStorage');
    // Stored rules are preserved, and missing built-in defaults are merged in
    const storedRule = result.current.localRules.find(r => r.id === 'test-rule');
    expect(storedRule).toEqual(storedConfig.rules.localRules[0]);
    expect(result.current.localRules.length).toBeGreaterThan(1);
    expect(result.current.localPrompts).toEqual(storedConfig.prompts.localPrompts);
  });

  it('auto-saves to localStorage on changes', async () => {
    const { result } = renderHook(() => usePersistedConfig());

    // Modify state
    act(() => {
      result.current.setLocalRules((prev) =>
        prev.map((r) => ({ ...r, enabled: false }))
      );
    });

    // Fast-forward debounce timer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(localStorageMock.setItem).toHaveBeenCalled();
    const savedData = localStorageMock.setItem.mock.calls.find(
      (call) => call[0] === STORAGE_KEY
    );
    expect(savedData).toBeDefined();
  });

  it('provides generateShareUrl function', () => {
    const { result } = renderHook(() => usePersistedConfig());

    const url = result.current.generateShareUrl();

    expect(url).toContain('http://localhost:3000');
    expect(url).toContain('config=');
  });

  it('generateShareUrl includes promptText when provided', () => {
    const { result } = renderHook(() => usePersistedConfig());

    const url = result.current.generateShareUrl('test prompt');

    expect(url).toContain('config=');
    // The URL should contain encoded session data
    const encoded = url.split('config=')[1];
    expect(encoded).toBeTruthy();
  });

  it('provides resetToDefaults function', async () => {
    const { result } = renderHook(() => usePersistedConfig());

    // Modify state first
    act(() => {
      result.current.setCustomCategories([
        {
          id: 'custom',
          name: 'Custom',
          description: 'Test',
          rules: [],
          isCustom: true,
        },
      ]);
    });

    expect(result.current.customCategories.length).toBe(1);

    // Reset to defaults
    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.customCategories).toEqual([]);
    expect(result.current.loadSource).toBe('defaults');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('loads from URL with highest priority', async () => {
    const hashConfig: PersistedConfig = {
      version: '1.0',
      savedAt: '2024-01-01T00:00:00.000Z',
      rules: {
        localRules: [
          {
            id: 'url-rule',
            name: 'URL Rule',
            description: 'From URL',
            type: 'keyword',
            severity: 'high',
            enabled: true,
            keywords: ['url'],
          },
        ],
        customCategories: [],
      },
      prompts: {
        localPrompts: [
          {
            id: 'url-category',
            name: 'URL Category',
            description: 'From URL',
            source: 'url',
            prompts: [],
          },
        ],
        customPromptCategories: [],
      },
    };

    // Set up URL with config (using hash query params for HashRouter style)
    const encoded = encodeConfig(hashConfig);
    window.location.hash = `#/scanner?config=${encoded}`;

    // Also set up localStorage (should be ignored)
    const storedConfig: PersistedConfig = {
      ...hashConfig,
      rules: {
        ...hashConfig.rules,
        localRules: [{ ...hashConfig.rules.localRules[0], id: 'storage-rule' }],
      },
    };
    localStorageMock._setStore({
      [STORAGE_KEY]: JSON.stringify(storedConfig),
    });

    const { result } = renderHook(() => usePersistedConfig());

    // Wait for state to settle - wrap in act() to handle state updates
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loadSource).toBe('url');
    expect(result.current.localRules[0].id).toBe('url-rule');
  });

  it('loads initialPromptText from URL session', async () => {
    const configWithSession: PersistedConfig = {
      version: '1.0',
      savedAt: '2024-01-01T00:00:00.000Z',
      rules: {
        localRules: [],
        customCategories: [],
      },
      prompts: {
        localPrompts: [],
        customPromptCategories: [],
      },
      session: {
        promptText: 'Hello from shared URL!',
      },
    };

    const encoded = encodeConfig(configWithSession);
    window.location.hash = `#/scanner?config=${encoded}`;

    const { result } = renderHook(() => usePersistedConfig());

    // Wait for state to settle - wrap in act() to handle state updates
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loadSource).toBe('url');
    expect(result.current.initialPromptText).toBe('Hello from shared URL!');
  });
});
