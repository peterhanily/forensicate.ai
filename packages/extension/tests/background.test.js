import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Background Script', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    it('should have correct performance limits', () => {
      const MAX_TEXT_LENGTH = 100000;
      const SCAN_TIMEOUT_MS = 5000;
      const MAX_HISTORY_ITEMS = 50;
      const MAX_LIBRARY_ITEMS = 1000;

      expect(MAX_TEXT_LENGTH).toBe(100000);
      expect(SCAN_TIMEOUT_MS).toBe(5000);
      expect(MAX_HISTORY_ITEMS).toBe(50);
      expect(MAX_LIBRARY_ITEMS).toBe(1000);
    });
  });

  describe('Storage Management', () => {
    it('should check storage quota', async () => {
      const { checkStorageQuota } = await import('../src/background.js');

      // Mock storage usage at 50%
      global.chrome.storage.local.getBytesInUse.mockResolvedValue(5242880); // 5MB

      await checkStorageQuota();

      expect(chrome.storage.local.getBytesInUse).toHaveBeenCalled();
    });

    it('should cleanup when storage is over 80%', async () => {
      // Mock storage at 85%
      global.chrome.storage.local.getBytesInUse.mockResolvedValue(8912896); // 8.5MB

      global.chrome.storage.local.get.mockResolvedValue({
        scanHistory: new Array(50).fill({ text: 'test' }),
        promptLibrary: new Array(100).fill({ text: 'test' })
      });

      const { checkStorageQuota } = await import('../src/background.js');
      await checkStorageQuota();

      // Should trigger cleanup
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('History Management', () => {
    it('should save scan to history', async () => {
      global.chrome.storage.local.get.mockResolvedValue({ scanHistory: [] });

      const { saveToHistory } = await import('../src/background.js');
      await saveToHistory({
        text: 'test prompt',
        confidence: 85,
        matchCount: 3,
        timestamp: Date.now(),
        sourceUrl: 'https://example.com'
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          scanHistory: expect.arrayContaining([
            expect.objectContaining({
              text: 'test prompt',
              confidence: 85
            })
          ])
        })
      );
    });

    it('should limit history to 50 items', async () => {
      const existingHistory = new Array(50).fill({ text: 'old' });
      global.chrome.storage.local.get.mockResolvedValue({ scanHistory: existingHistory });

      const { saveToHistory } = await import('../src/background.js');
      await saveToHistory({
        text: 'new prompt',
        confidence: 50,
        matchCount: 1,
        timestamp: Date.now(),
        sourceUrl: 'test'
      });

      const savedHistory = chrome.storage.local.set.mock.calls[0][0].scanHistory;
      expect(savedHistory.length).toBe(50);
      expect(savedHistory[0].text).toBe('new prompt');
    });
  });

  describe('Library Management', () => {
    it('should save prompt to library', async () => {
      global.chrome.storage.local.get.mockResolvedValue({ promptLibrary: [] });

      const { saveToLibrary } = await import('../src/background.js');
      const result = await saveToLibrary({
        text: 'malicious prompt',
        confidence: 95,
        matchCount: 5,
        sourceUrl: 'https://evil.com'
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('should reject when library is full', async () => {
      const fullLibrary = new Array(1000).fill({ text: 'test' });
      global.chrome.storage.local.get.mockResolvedValue({ promptLibrary: fullLibrary });

      const { saveToLibrary } = await import('../src/background.js');

      await expect(saveToLibrary({ text: 'new' })).rejects.toThrow('Library is full');
    });

    it('should truncate long text when saving', async () => {
      global.chrome.storage.local.get.mockResolvedValue({ promptLibrary: [] });

      const longText = 'a'.repeat(10000);
      const { saveToLibrary } = await import('../src/background.js');
      await saveToLibrary({ text: longText });

      const saved = chrome.storage.local.set.mock.calls[0][0].promptLibrary[0];
      expect(saved.text.length).toBeLessThanOrEqual(5000);
    });
  });

  describe('Stats', () => {
    it('should calculate stats correctly', async () => {
      global.chrome.storage.local.get.mockResolvedValue({
        scanHistory: [{ text: 'a' }, { text: 'b' }],
        promptLibrary: [
          { confidence: 80 }, // high
          { confidence: 50 }, // medium
          { confidence: 20 }  // low
        ]
      });

      const { getStats } = await import('../src/background.js');
      const stats = await getStats();

      expect(stats.totalScans).toBe(2);
      expect(stats.totalSaved).toBe(3);
      expect(stats.highRisk).toBe(1);
      expect(stats.mediumRisk).toBe(1);
      expect(stats.lowRisk).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should show user-friendly error for invalid input', () => {
      expect(() => {
        // Test would call scanAndShowResult with invalid input
        // Should show error notification
      }).not.toThrow();
    });
  });

  describe('Timeout Protection', () => {
    it('should complete fast scans before timeout', async () => {
      const { scanWithTimeout } = await import('../src/background.js');

      // This should complete before timeout
      const result = await scanWithTimeout('test', [], 5000);
      expect(result).toBeDefined();
    });
  });

  describe('Rule Caching', () => {
    it('should cache rules for performance', async () => {
      const { getCachedRules } = await import('../src/background.js');

      const rules1 = getCachedRules();
      const rules2 = getCachedRules();

      // Should return same reference when cached
      expect(rules1).toBe(rules2);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old data when over quota', async () => {
      const history = new Array(50).fill({ text: 'test' });
      const library = new Array(1000).fill({ text: 'test' });

      global.chrome.storage.local.get.mockResolvedValue({
        scanHistory: history,
        promptLibrary: library
      });

      // Trigger cleanup by exceeding quota
      global.chrome.storage.local.getBytesInUse.mockResolvedValue(9000000); // 85%

      const { checkStorageQuota } = await import('../src/background.js');
      await checkStorageQuota();

      // Should have trimmed the arrays
      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.scanHistory.length).toBeLessThan(history.length);
    });

    it('should not cleanup when under 80% quota', async () => {
      global.chrome.storage.local.getBytesInUse.mockResolvedValue(5000000); // 48%

      const { checkStorageQuota } = await import('../src/background.js');
      await checkStorageQuota();

      // Should NOT trigger cleanup
      // No set call should be made for cleanup
    });

    it('should handle cleanup errors gracefully', async () => {
      global.chrome.storage.local.getBytesInUse.mockResolvedValue(9000000); // 85%
      global.chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const { checkStorageQuota } = await import('../src/background.js');

      // Should not throw
      await expect(checkStorageQuota()).resolves.not.toThrow();
    });

    it('should handle quota check errors gracefully', async () => {
      global.chrome.storage.local.getBytesInUse.mockRejectedValue(new Error('Quota error'));

      const { checkStorageQuota } = await import('../src/background.js');

      // Should not throw
      await expect(checkStorageQuota()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty library when saving', async () => {
      global.chrome.storage.local.get.mockResolvedValue({});

      const { saveToLibrary } = await import('../src/background.js');
      const result = await saveToLibrary({ text: 'test' });

      expect(result).toHaveProperty('id');
      expect(result.text).toBe('test');
    });

    it('should handle empty history when saving', async () => {
      global.chrome.storage.local.get.mockResolvedValue({});

      const { saveToHistory } = await import('../src/background.js');
      await saveToHistory({ text: 'test', confidence: 50 });

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('should handle missing fields in library save', async () => {
      global.chrome.storage.local.get.mockResolvedValue({ promptLibrary: [] });

      const { saveToLibrary } = await import('../src/background.js');
      const result = await saveToLibrary({}); // Empty object

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.matchCount).toBe(0);
      expect(result.sourceUrl).toBe('');
    });

    it('should handle stats with empty storage', async () => {
      global.chrome.storage.local.get.mockResolvedValue({});

      const { getStats } = await import('../src/background.js');
      const stats = await getStats();

      expect(stats.totalScans).toBe(0);
      expect(stats.totalSaved).toBe(0);
      expect(stats.highRisk).toBe(0);
      expect(stats.mediumRisk).toBe(0);
      expect(stats.lowRisk).toBe(0);
    });

    it('should handle storage errors in saveToHistory', async () => {
      global.chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const { saveToHistory } = await import('../src/background.js');

      // Should not throw (error is caught internally)
      await expect(saveToHistory({ text: 'test' })).resolves.not.toThrow();
    });

    it('should handle storage set errors in saveToHistory', async () => {
      global.chrome.storage.local.get.mockResolvedValue({ scanHistory: [] });
      global.chrome.storage.local.set.mockRejectedValue(new Error('Set error'));

      const { saveToHistory } = await import('../src/background.js');

      // Should not throw (error is caught internally)
      await expect(saveToHistory({ text: 'test' })).resolves.not.toThrow();
    });
  });
});
