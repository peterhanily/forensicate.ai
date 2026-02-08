// Background service worker for Forensicate.ai extension
// Handles context menu, keyboard shortcuts, and scanning

import { scanPrompt, getEnabledRules } from '@forensicate/scanner';

// Constants
const MAX_TEXT_LENGTH = 100000; // 100KB max
const SCAN_TIMEOUT_MS = 5000; // 5 second timeout
const MAX_HISTORY_ITEMS = 50;
const MAX_LIBRARY_ITEMS = 1000;

// Rule caching
let cachedRules = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Window management for result reuse
let resultWindowId = null;

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
    scanAndShowResult(info.selectionText, tab.url);
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'scan-selection') {
    try {
      // Get selected text from active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.id) {
        showError('No active tab found');
        return;
      }

      // Execute script to get selected text
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString()
      });

      const selectedText = results[0]?.result;
      if (selectedText) {
        scanAndShowResult(selectedText, tab.url);
      } else {
        showError('No text selected. Please select some text and try again.');
      }
    } catch (error) {
      console.error('Keyboard shortcut error:', error);
      showError('Failed to scan selection. Make sure you have text selected.');
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
async function scanAndShowResult(text, sourceUrl) {
  try {
    // Input validation
    if (!text || typeof text !== 'string') {
      showError('Invalid input: text must be a string');
      return;
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      showError('No text to scan. Please select some text.');
      return;
    }

    // Length check
    if (trimmedText.length > MAX_TEXT_LENGTH) {
      showError(
        `Text too long: ${trimmedText.length.toLocaleString()} characters.\n` +
        `Maximum allowed: ${MAX_TEXT_LENGTH.toLocaleString()} characters.\n\n` +
        `Please select a smaller portion of text.`
      );
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
    await chrome.storage.local.set({
      lastScanResult: resultData,
      fullScanResult: fullScanResult,
      lastScanTimestamp: Date.now()
    });

    // Check storage quota before proceeding
    await checkStorageQuota();

    // Show result as bubble overlay on the page
    await showBubbleOverlay(trimmedText, resultData, fullScanResult);

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

    showError(errorMessage);
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

// Show bubble overlay on current page
async function showBubbleOverlay(text, resultData, fullScanResult) {
  try {
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      console.error('No active tab found');
      return;
    }

    // Inject content script dynamically (only when needed via activeTab permission)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (injectError) {
      // Content script might already be injected, or injection failed
      console.log('Content script injection note:', injectError.message);
    }

    // Small delay to ensure content script is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send message to content script to show bubble
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_SCAN_RESULT',
      result: resultData,
      fullResult: fullScanResult
    });
  } catch (error) {
    console.error('Failed to show bubble overlay:', error);
    // Fallback to notification if content script not available
    showError('Unable to display result overlay. Please refresh the page and try again.');
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

// Show low-risk notification (instead of full window)
async function showLowRiskNotification(text, result, sourceUrl) {
  const truncatedText = text.substring(0, 50) + (text.length > 50 ? '...' : '');

  const notificationId = `scan-${Date.now()}`;

  chrome.notifications?.create(notificationId, {
    type: 'basic',
    iconUrl: 'assets/icon-48.png',
    title: `✅ Low Risk (${result.confidence}%)`,
    message: `Scanned: "${truncatedText}"\n\n${result.matchedRules.length} minor matches found.`,
    buttons: [
      { title: 'View Details' },
      { title: 'Save to Library' }
    ],
    priority: 0
  });

  // Store notification data for button clicks
  const notificationData = {
    text: text,
    result: result,
    sourceUrl: sourceUrl
  };

  // Handle button clicks
  const handleButtonClick = (clickedNotificationId, buttonIndex) => {
    if (clickedNotificationId !== notificationId) return;

    if (buttonIndex === 0) {
      // View Details
      showResultWindow();
    } else if (buttonIndex === 1) {
      // Save to Library with complete data
      saveToLibrary({
        text: notificationData.text,
        confidence: notificationData.result.confidence,
        matchCount: notificationData.result.matchedRules.length,
        matchedRules: notificationData.result.matchedRules.slice(0, 10).map(m => ({
          ruleId: m.ruleId,
          ruleName: m.ruleName,
          severity: m.severity,
          matches: m.matches?.slice(0, 3),
          confidenceImpact: m.confidenceImpact
        })),
        sourceUrl: notificationData.sourceUrl
      });
    }

    // Remove listener after handling
    chrome.notifications.onButtonClicked.removeListener(handleButtonClick);
  };

  chrome.notifications.onButtonClicked.addListener(handleButtonClick);
}

// Show error notification
function showError(message) {
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'assets/icon-48.png',
    title: 'Forensicate.ai',
    message: message,
    priority: 1
  });
}

// Message handler (for future use)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCAN_TEXT') {
    (async () => {
      try {
        const rules = getCachedRules();
        const result = await scanWithTimeout(message.text, rules, SCAN_TIMEOUT_MS);
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
  }
});

console.log('Forensicate.ai background worker loaded');
