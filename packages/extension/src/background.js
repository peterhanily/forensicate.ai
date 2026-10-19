// Background service worker for Forensicate.ai extension
// Handles context menu, keyboard shortcuts, and scanning
//
// DETECTION ENGINE (bundled from @forensicate/scanner):
// - Dozens of static detection rules (keyword, regex, heuristic, and NLP-based)
// - AFINN-165 sentiment analysis dictionary (static wordlist)
// - compromise.js NLP library for POS tagging
// - All scanning happens locally (no external API calls)
// - No remote code execution or dynamic rule loading
//
// Source code: https://github.com/peterhanily/forensicate.ai

import { scanPrompt, getEnabledRules } from '@forensicate/scanner';

// Constants
const MAX_TEXT_LENGTH = 100000; // UTF-16 code units
const SCAN_TIMEOUT_MS = 5000; // 5 second timeout
const MAX_HISTORY_ITEMS = 50;
const MAX_LIBRARY_ITEMS = 1000;

// Rule caching
let cachedRules = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Window management for result reuse
let resultWindowId = null;

// Each tab owns its overlay; the detail-page result is shared across all tabs.
let nextRequestId = 0;
let latestRequest;
const tabRequests = new Map();
const tabPublications = new Map();
let resultStorageUpdates = Promise.resolve();

function beginRequest(tabId) {
  const request = { id: ++nextRequestId, tabId };
  latestRequest = request;
  bindRequestToTab(request, tabId);
  return request;
}

function bindRequestToTab(request, tabId) {
  request.tabId = tabId;
  if ((tabRequests.get(tabId)?.id ?? 0) < request.id) tabRequests.set(tabId, request);
}

function isCurrentRequest(request) {
  return tabRequests.get(request.tabId) === request;
}

function updateCurrentResult(request, update) {
  const operation = resultStorageUpdates.then(() => {
    if (latestRequest === request && isCurrentRequest(request)) return update();
  });
  // Serialize set/remove calls as well as checking freshness: an in-flight write
  // cannot be cancelled, so a newer request must finish its update afterward.
  resultStorageUpdates = operation.catch(() => {});
  return operation;
}

function publishRequest(request, publish) {
  const tabId = request.tabId;
  const operation = (tabPublications.get(tabId) ?? Promise.resolve()).then(() => {
    if (isCurrentRequest(request)) return publish();
  });
  const settled = operation.catch(() => {});
  tabPublications.set(tabId, settled);
  settled.then(() => {
    if (tabPublications.get(tabId) === settled) tabPublications.delete(tabId);
  });
  return operation;
}

chrome.tabs.onRemoved.addListener(tabId => tabRequests.delete(tabId));

// Create context menu (runs on install and startup)
function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'scan-selection',
      title: 'Scan with Forensicate.ai',
      contexts: ['selection']
    });
    console.log('Forensicate.ai context menu created');
  });
}

// Create on install
chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
  console.log('Forensicate.ai extension installed');
});

// Create on startup (handles reloads)
chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
  console.log('Forensicate.ai extension started');
});

// Also create immediately on script load
createContextMenu();

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scan-selection' && info.selectionText) {
    return scanAndShowResult(info.selectionText, tab?.url, beginRequest(tab?.id));
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'scan-selection') {
    const request = beginRequest();
    try {
      // Get selected text from active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab?.id == null) {
        await showError('No active tab found', request);
        return;
      }
      bindRequestToTab(request, tab.id);
      if (!isCurrentRequest(request)) return;

      // Execute script to get selected text
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });

      const selectedText = results[0]?.result;
      if (!isCurrentRequest(request)) return;
      if (selectedText) {
        await scanAndShowResult(selectedText, tab.url, request);
      } else {
        await showError('No text selected. Please select some text and try again.', request);
      }
    } catch (error) {
      console.error('Keyboard shortcut error:', error);
      await showError('Failed to scan selection. Make sure you have text selected.', request);
    }
  }
});

// Get cached rules (performance optimization)
export function getCachedRules() {
  const now = Date.now();
  if (!cachedRules || now - cacheTime > CACHE_TTL) {
    cachedRules = getEnabledRules();
    cacheTime = now;
    console.log(`Rules cached: ${cachedRules.length} rules`);
  }
  return cachedRules;
}

// Scan with timeout protection
export async function scanWithTimeout(text, rules, timeoutMs) {
  return Promise.race([
    // Actual scan
    Promise.resolve(scanPrompt(text, rules, 0)),

    // Timeout
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Scan timeout exceeded')), timeoutMs)
    )
  ]);
}

// Main scanning function with safeguards
async function scanAndShowResult(text, sourceUrl, request) {
  try {
    if (request.tabId == null) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      bindRequestToTab(request, tab?.id);
    }
    if (!isCurrentRequest(request)) return;
    // Input validation
    if (!text || typeof text !== 'string') {
      await showError('Invalid input: text must be a string', request);
      return;
    }

    // Length check
    if (text.length > MAX_TEXT_LENGTH) {
      await showError(
        `Text too long: ${text.length.toLocaleString('en-US')} UTF-16 code units.\n` +
        `Maximum allowed: ${MAX_TEXT_LENGTH.toLocaleString('en-US')} UTF-16 code units.\n\n` +
        'Please select a smaller portion of text.', request,
      );
      return;
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      await showError('No text to scan. Please select some text.', request);
      return;
    }

    // Get rules (cached for performance)
    const rules = getCachedRules();

    // Scan with timeout protection
    const result = await scanWithTimeout(trimmedText, rules, SCAN_TIMEOUT_MS);

    // Save to history
    await saveToHistory({
      text: trimmedText.substring(0, 200), // Truncate for storage
      confidence: result.confidence,
      matchCount: result.matchedRules.length,
      timestamp: Date.now(),
      sourceUrl
    });

    // Prepare result data (compressed for storage)
    const resultData = {
      text: trimmedText.substring(0, 1000), // Limit text size
      textLength: trimmedText.length,
      confidence: result.confidence,
      riskLevel: result.riskLevel,
      matchCount: result.matchedRules.length,
      topMatches: result.matchedRules.slice(0, 5).map(m => ({
        ruleId: m.ruleId,
        ruleName: m.ruleName,
        severity: m.severity,
        matches: m.matches?.slice(0, 3),
        confidenceImpact: m.confidenceImpact
      }))
    };

    // Store full scan result for annotations (with positions)
    const fullScanResult = {
      text: trimmedText,
      confidence: result.confidence,
      matchedRules: result.matchedRules.map(m => ({
        ruleId: m.ruleId,
        ruleName: m.ruleName,
        ruleType: m.ruleType,
        severity: m.severity,
        positions: m.positions || [],
        matchPositions: m.matchPositions || []
      }))
    };

    // Store result temporarily for detail page (compressed)
    // fullScanResult expires after 10 minutes to limit sensitive data retention
    await updateCurrentResult(request, () => chrome.storage.local.set({
      lastScanResult: resultData,
      fullScanResult: fullScanResult,
      lastScanTimestamp: Date.now(),
      fullScanResultExpiry: Date.now() + 10 * 60 * 1000
    }));

    // Check storage quota before proceeding
    await checkStorageQuota();

    // Show result as bubble overlay on the page
    await showBubbleOverlay(resultData, fullScanResult, request);

  } catch (error) {
    console.error('Scan error:', error);

    // User-friendly error messages
    let errorMessage = 'Failed to scan text. ';

    if (error.message?.includes('timeout')) {
      errorMessage += 'The scan took too long. Try selecting less complex text.';
    } else if (error.message?.includes('memory')) {
      errorMessage += 'Not enough memory. Try selecting less text.';
    } else {
      errorMessage += 'Please try again.';
    }

    await showError(errorMessage, request);
  }
}

// Save scan to history (last 50 items)
export async function saveToHistory(entry) {
  try {
    const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');

    // Add new entry at beginning
    scanHistory.unshift(entry);

    // Keep only last N items
    if (scanHistory.length > MAX_HISTORY_ITEMS) {
      scanHistory.length = MAX_HISTORY_ITEMS;
    }

    await chrome.storage.local.set({ scanHistory });
  } catch (error) {
    console.error('Failed to save history:', error);
    // Non-critical, don't show error to user
  }
}

// Storage quota management
export async function checkStorageQuota() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const QUOTA_BYTES = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB
    const percentUsed = (bytesInUse / QUOTA_BYTES) * 100;

    console.log(`Storage: ${(bytesInUse / 1024).toFixed(2)} KB / ${(QUOTA_BYTES / 1024).toFixed(0)} KB (${percentUsed.toFixed(1)}%)`);

    // Cleanup if over 80% full
    if (percentUsed > 80) {
      console.warn('Storage quota 80% full, cleaning up...');
      await cleanupOldData();
    }
  } catch (error) {
    console.error('Storage quota check failed:', error);
  }
}

// Cleanup old data when storage is full
async function cleanupOldData() {
  try {
    const { scanHistory = [], promptLibrary = [] } = await chrome.storage.local.get([
      'scanHistory',
      'promptLibrary'
    ]);

    // Keep only last 25 history items (reduced from 50)
    const trimmedHistory = scanHistory.slice(0, 25);

    // Keep only last 500 library items (reduced from unlimited)
    const trimmedLibrary = promptLibrary.slice(0, 500);

    await chrome.storage.local.set({
      scanHistory: trimmedHistory,
      promptLibrary: trimmedLibrary
    });

    console.log(`Cleaned up: History ${scanHistory.length} → ${trimmedHistory.length}, Library ${promptLibrary.length} → ${trimmedLibrary.length}`);
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

async function sendOverlayMessage(message, request) {
  const { tabId } = request;
  if (!isCurrentRequest(request)) return;
  if (tabId == null) throw new Error('No active tab found');

  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    if (!isCurrentRequest(request)) return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
  if (!isCurrentRequest(request)) return;
  await chrome.tabs.sendMessage(tabId, message);
}

// Show bubble overlay on the tab where the scan was requested.
async function showBubbleOverlay(resultData, fullScanResult, request) {
  try {
    await publishRequest(request, async () => {
      await sendOverlayMessage({
        type: 'SHOW_SCAN_RESULT',
        result: resultData,
        fullResult: fullScanResult
      }, request);
      if (isCurrentRequest(request)) await updateScanBadge('', request.tabId);
    });
  } catch (error) {
    console.error('Failed to show bubble overlay:', error);
    await showError('Unable to display result overlay. Please refresh the page and try again.', request);
  }
}

// Show result window (for fallback/view details)
async function showResultWindow() {
  // Try to reuse existing window
  if (resultWindowId) {
    try {
      const window = await chrome.windows.get(resultWindowId);
      // Window exists, focus it and update
      await chrome.windows.update(resultWindowId, { focused: true });
      console.log('Reused existing result window');
      return;
    } catch (error) {
      // Window was closed, clear ID
      resultWindowId = null;
    }
  }

  // Create new window
  const window = await chrome.windows.create({
    url: chrome.runtime.getURL('pages/result.html'),
    type: 'popup',
    width: 500,
    height: 600
  });

  resultWindowId = window.id;

  // Clean up ID when window is closed
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === resultWindowId) {
      resultWindowId = null;
    }
  });
}

async function updateScanBadge(message, tabId) {
  const target = tabId == null ? {} : { tabId };
  await Promise.allSettled([
    chrome.action.setBadgeText({ ...target, text: message ? '!' : '' }),
    chrome.action.setTitle({ ...target, title: message ? `Forensicate.ai: Not scanned. ${message}` : 'Forensicate.ai - Prompt Security Scanner' }),
  ]);
}

// Replace any earlier result with a visible failure, without notification permissions.
async function showError(message, request) {
  if (!isCurrentRequest(request)) return;
  console.error('[Forensicate.ai]', message);
  try {
    await updateCurrentResult(request, () => chrome.storage.local.remove([
      'lastScanResult', 'fullScanResult', 'lastScanTimestamp', 'fullScanResultExpiry',
    ]));
  } catch (error) {
    console.error('Failed to clear previous scan result:', error);
  }

  try {
    await publishRequest(request, async () => {
      // The badge and tooltip remain available on pages that prohibit script injection.
      await updateScanBadge(message, request.tabId);
      await sendOverlayMessage({ type: 'SHOW_SCAN_ERROR', message }, request);
    });
  } catch (error) {
    console.error('Failed to display scan error overlay:', error);
  }
}

// Message handler (for future use)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCAN_TEXT') {
    (async () => {
      try {
        if (!message.text || typeof message.text !== 'string') {
          sendResponse({ success: false, error: 'Invalid input: text must be a string' });
          return;
        }
        if (message.text.length > MAX_TEXT_LENGTH) {
          sendResponse({ success: false, error: `Text not scanned: exceeds the ${MAX_TEXT_LENGTH.toLocaleString('en-US')} UTF-16 code unit limit` });
          return;
        }
        const text = message.text.trim();
        if (text.length === 0) {
          sendResponse({ success: false, error: 'Text is empty' });
          return;
        }
        const rules = getCachedRules();
        const result = await scanWithTimeout(text, rules, SCAN_TIMEOUT_MS);
        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.type === 'SAVE_TO_LIBRARY') {
    saveToLibrary(message.prompt).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'GET_STATS') {
    getStats().then(stats => {
      sendResponse({ success: true, stats });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.type === 'OPEN_HISTORY') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/history.html') });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'OPEN_LIBRARY') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/library.html') });
    sendResponse({ success: true });
    return true;
  }
});

// Save prompt to library
export async function saveToLibrary(promptData) {
  try {
    const { promptLibrary = [] } = await chrome.storage.local.get('promptLibrary');

    // Check library size limit
    if (promptLibrary.length >= MAX_LIBRARY_ITEMS) {
      throw new Error(`Library is full (max ${MAX_LIBRARY_ITEMS} items). Please remove some prompts.`);
    }

    const newPrompt = {
      id: Date.now().toString(),
      text: promptData.text?.substring(0, 5000) || '', // Limit stored text
      confidence: promptData.confidence || 0,
      matchCount: promptData.matchCount || 0,
      matchedRules: promptData.matchedRules || [], // Store matched rules for annotations
      sourceUrl: promptData.sourceUrl || '',
      timestamp: Date.now(),
      tags: [],
      notes: ''
    };

    promptLibrary.push(newPrompt);
    await chrome.storage.local.set({ promptLibrary });

    console.log(`Saved to library: ${newPrompt.id}`);
    return newPrompt;
  } catch (error) {
    console.error('Save to library failed:', error);
    throw error;
  }
}

// Get extension stats
export async function getStats() {
  const { scanHistory = [], promptLibrary = [] } = await chrome.storage.local.get([
    'scanHistory',
    'promptLibrary'
  ]);

  return {
    totalScans: scanHistory.length,
    totalSaved: promptLibrary.length,
    highRisk: promptLibrary.filter(p => p.confidence >= 70).length,
    mediumRisk: promptLibrary.filter(p => p.confidence >= 30 && p.confidence < 70).length,
    lowRisk: promptLibrary.filter(p => p.confidence < 30).length
  };
}

// Periodic cleanup (every hour)
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    checkStorageQuota();
    // Clear expired fullScanResult to limit sensitive data retention
    chrome.storage.local.get(['fullScanResultExpiry'], ({ fullScanResultExpiry }) => {
      if (fullScanResultExpiry && Date.now() > fullScanResultExpiry) {
        chrome.storage.local.remove(['fullScanResult', 'fullScanResultExpiry']);
      }
    });
  }
});

console.log('Forensicate.ai background worker loaded');
