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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function select(text, tabId = 17) {
  return scanSelection({ menuItemId: 'scan-selection', selectionText: text }, { id: tabId });
}

function currentResultWrites() {
  return chrome.storage.local.set.mock.calls.map(([value]) => value).filter(value => value.lastScanResult);
}

function overlays() {
  return chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type !== 'PING');
}

describe('Overlapping selection requests', () => {
  it('keeps a newer rejection when an older successful scan finishes saving history', async () => {
    const history = deferred();
    const started = deferred();
    chrome.storage.local.get.mockImplementationOnce(() => { started.resolve(); return history.promise; });
    const older = select('Earlier meeting agenda.');
    await started.promise;

    await select('a'.repeat(100_001));
    history.resolve({});
    await older;

    expect(overlays()).toEqual([[17, expect.objectContaining({ type: 'SHOW_SCAN_ERROR' })]]);
    expect(currentResultWrites()).toEqual([]);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 17, text: '!' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ scanHistory: expect.any(Array) }));
  });

  it('keeps a newer success when an older successful scan finishes saving history', async () => {
    const history = deferred();
    const started = deferred();
    chrome.storage.local.get.mockImplementationOnce(() => { started.resolve(); return history.promise; });
    const older = select('Earlier meeting agenda.');
    await started.promise;

    await select('Latest meeting agenda.');
    history.resolve({});
    await older;

    expect(overlays()).toEqual([[17, expect.objectContaining({
      type: 'SHOW_SCAN_RESULT', result: expect.objectContaining({ text: 'Latest meeting agenda.' }),
    })]]);
    expect(currentResultWrites().map(value => value.lastScanResult.text)).toEqual(['Latest meeting agenda.']);
  });

  it('finishes an in-flight old removal before storing a newer successful result', async () => {
    const removal = deferred();
    const started = deferred();
    const storage = {};
    chrome.storage.local.remove.mockImplementationOnce(async keys => {
      started.resolve();
      await removal.promise;
      for (const key of keys) delete storage[key];
    });
    chrome.storage.local.set.mockImplementation(async values => { Object.assign(storage, values); });
    const older = select('a'.repeat(100_001));
    await started.promise;
    const newer = select('Latest meeting agenda.');
    removal.resolve();
    await Promise.all([older, newer]);

    expect(storage.lastScanResult.text).toBe('Latest meeting agenda.');
    expect(overlays()).toEqual([[17, expect.objectContaining({ type: 'SHOW_SCAN_RESULT' })]]);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalledWith({ tabId: 17, text: '!' });
  });

  it('removes an in-flight old stored result after a newer request is rejected', async () => {
    const write = deferred();
    const started = deferred();
    const storage = {};
    chrome.storage.local.set.mockImplementation(async values => {
      if (values.lastScanResult) { started.resolve(); await write.promise; }
      Object.assign(storage, values);
    });
    chrome.storage.local.remove.mockImplementation(async keys => {
      for (const key of keys) delete storage[key];
    });
    const older = select('Earlier meeting agenda.');
    await started.promise;
    const newer = select('a'.repeat(100_001));
    write.resolve();
    await Promise.all([older, newer]);

    expect(storage.lastScanResult).toBeUndefined();
    expect(storage.fullScanResult).toBeUndefined();
    expect(overlays()).toEqual([[17, expect.objectContaining({ type: 'SHOW_SCAN_ERROR' })]]);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 17, text: '!' });
  });

  it('does not let an old overlay acknowledgement clear a newer failure badge', async () => {
    const acknowledgement = deferred();
    const started = deferred();
    const removed = deferred();
    chrome.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
      if (message.type === 'SHOW_SCAN_RESULT') { started.resolve(); await acknowledgement.promise; }
      return { success: true };
    });
    chrome.storage.local.remove.mockImplementation(async () => { removed.resolve(); });
    const older = select('Earlier meeting agenda.');
    await started.promise;
    const newer = select('a'.repeat(100_001));
    await removed.promise;
    acknowledgement.resolve();
    await Promise.all([older, newer]);

    expect(overlays().map(([, message]) => message.type)).toEqual(['SHOW_SCAN_RESULT', 'SHOW_SCAN_ERROR']);
    expect(chrome.action.setBadgeText.mock.calls).toEqual([[{ tabId: 17, text: '!' }]]);
  });

  it('does not send an old result after its content-script readiness check finishes', async () => {
    const ping = deferred();
    const started = deferred();
    chrome.tabs.sendMessage.mockImplementationOnce(() => { started.resolve(); return ping.promise; });
    const older = select('Earlier meeting agenda.');
    await started.promise;
    const newer = select('a'.repeat(100_001));
    ping.resolve({ success: true });
    await Promise.all([older, newer]);

    expect(overlays()).toEqual([[17, expect.objectContaining({ type: 'SHOW_SCAN_ERROR' })]]);
  });

  it('keeps each tab overlay while only the newest request owns shared result storage', async () => {
    const history = deferred();
    const started = deferred();
    chrome.storage.local.get.mockImplementationOnce(() => { started.resolve(); return history.promise; });
    const older = select('Earlier tab agenda.', 17);
    await started.promise;
    await select('Latest tab agenda.', 99);
    history.resolve({});
    await older;

    expect(overlays().map(([tabId, message]) => [tabId, message.result.text])).toEqual([
      [99, 'Latest tab agenda.'], [17, 'Earlier tab agenda.'],
    ]);
    expect(currentResultWrites().map(value => value.lastScanResult.text)).toEqual(['Latest tab agenda.']);
  });

  it('does not let a delayed failure in another tab erase the newest shared result', async () => {
    const extraction = deferred();
    const started = deferred();
    chrome.tabs.query.mockResolvedValue([{ id: 17 }]);
    chrome.scripting.executeScript.mockImplementationOnce(() => { started.resolve(); return extraction.promise; });
    const older = onCommand('scan-selection');
    await started.promise;
    await select('Latest tab agenda.', 99);
    extraction.reject(new Error('Selection unavailable'));
    await older;

    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(currentResultWrites().map(value => value.lastScanResult.text)).toEqual(['Latest tab agenda.']);
    expect(overlays().map(([tabId, message]) => [tabId, message.type])).toEqual([
      [99, 'SHOW_SCAN_RESULT'], [17, 'SHOW_SCAN_ERROR'],
    ]);
  });

  it('does not revive an old keyboard request when tab lookup finishes late', async () => {
    const lookup = deferred();
    chrome.tabs.query.mockReturnValueOnce(lookup.promise);
    const older = onCommand('scan-selection');
    await select('Latest meeting agenda.', 17);
    lookup.resolve([{ id: 17 }]);
    await older;

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(overlays()).toHaveLength(1);
  });
});
