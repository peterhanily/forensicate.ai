import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scanner = vi.hoisted(() => ({ scanPrompt: vi.fn(), getEnabledRules: vi.fn() }));
vi.mock('@forensicate/scanner', () => scanner);

let scanSelection;
let onCommand;
let onMessage;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  scanner.getEnabledRules.mockReturnValue([]);
  scanner.scanPrompt.mockReturnValue({ confidence: 0, matchedRules: [], isPositive: false });
  chrome.contextMenus.removeAll.mockImplementation(callback => callback());
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
  chrome.storage.local.getBytesInUse.mockResolvedValue(0);
  chrome.tabs.query.mockResolvedValue([{ id: 99, url: 'https://example.com' }]);
  chrome.tabs.sendMessage.mockResolvedValue({ success: true });
  chrome.scripting.executeScript.mockResolvedValue([]);
  chrome.action.setBadgeText.mockResolvedValue(undefined);
  chrome.action.setTitle.mockResolvedValue(undefined);
  await import('../src/background.js');
  scanSelection = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];
  onCommand = chrome.commands.onCommand.addListener.mock.calls[0][0];
  onMessage = chrome.runtime.onMessage.addListener.mock.calls[0][0];
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Browser input limits', () => {
  it.each([
    'a'.repeat(100_001),
    '📝'.repeat(50_001),
    ' '.repeat(100_000) + 'a',
  ])('rejects oversized selections before scanning and replaces the current result', async text => {
    await scanSelection({ menuItemId: 'scan-selection', selectionText: text }, { id: 17 });

    expect(scanner.scanPrompt).not.toHaveBeenCalled();
    expect(scanner.getEnabledRules).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(17, {
      type: 'SHOW_SCAN_ERROR',
      message: expect.stringContaining('100,000 UTF-16 code units'),
    });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 17, text: '!' });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(expect.arrayContaining(['lastScanResult', 'fullScanResult']));
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('scans the exact limit in full and clears the failure badge after success', async () => {
    const tab = { id: 17 };
    await scanSelection({ menuItemId: 'scan-selection', selectionText: 'a'.repeat(100_001) }, tab);
    const text = 'a'.repeat(99_999) + 'z';
    await scanSelection({ menuItemId: 'scan-selection', selectionText: text }, tab);

    expect(scanner.scanPrompt).toHaveBeenCalledExactlyOnceWith(text, [], 0);
    expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(17, expect.objectContaining({ type: 'SHOW_SCAN_RESULT' }));
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 17, text: '' });
    expect(chrome.action.setTitle).toHaveBeenLastCalledWith({ tabId: 17, title: 'Forensicate.ai - Prompt Security Scanner' });
  });

  it('shows keyboard shortcut rejections in the originating tab', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: 'a'.repeat(100_001) }]);
    await onCommand('scan-selection');
    expect(scanner.scanPrompt).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(99, expect.objectContaining({ type: 'SHOW_SCAN_ERROR' }));
  });

  it('leaves a visible badge and reason when a page blocks content injection', async () => {
    chrome.tabs.sendMessage.mockRejectedValue(new Error('No content script'));
    chrome.scripting.executeScript.mockRejectedValue(new Error('Restricted page'));
    await expect(scanSelection({ menuItemId: 'scan-selection', selectionText: 'a'.repeat(100_001) }, { id: 17 })).resolves.toBeUndefined();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 17, text: '!' });
    expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 17, title: expect.stringContaining('Not scanned') });
  });

  it('returns an explicit rejection for oversized SCAN_TEXT input before trimming', async () => {
    const response = await new Promise(resolve => {
      onMessage({ type: 'SCAN_TEXT', text: ' '.repeat(100_000) + 'a' }, {}, resolve);
    });
    expect(response).toEqual({ success: false, error: expect.stringContaining('not scanned') });
    expect(scanner.scanPrompt).not.toHaveBeenCalled();
  });

  it('surfaces scanner failures without storing a successful result', async () => {
    scanner.scanPrompt.mockImplementation(() => { throw new Error('Test scanner unavailable'); });
    await scanSelection({ menuItemId: 'scan-selection', selectionText: 'A meeting agenda.' }, { id: 17 });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(17, expect.objectContaining({ type: 'SHOW_SCAN_ERROR' }));
  });
});
