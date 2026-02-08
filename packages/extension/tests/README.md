# Extension Testing Guide

## Current Test Coverage

**Unit Test Coverage: 41.61%**
- 22 passing tests across core business logic
- Focused on testable functions: storage, history, library, stats, caching

## What's Tested

### ✅ Covered by Unit Tests
- **Storage Management**: Quota checking, cleanup triggers, error handling
- **History Management**: Saving scans, size limits, empty states
- **Library Management**: Saving prompts, size limits, truncation, full library rejection
- **Statistics**: Calculation, empty states, risk categorization
- **Rule Caching**: Performance optimization, cache reuse
- **Error Handling**: Storage errors, quota errors, edge cases
- **Timeout Protection**: Fast scan completion

### ❌ Not Covered by Unit Tests (Requires E2E Testing)
- **Chrome Event Handlers**: `onInstalled`, `contextMenus.onClicked`, `commands.onCommand`, `onMessage`
- **UI/Notifications**: `showError`, `showLowRiskNotification`
- **Window Management**: `showResultWindow`, window reuse logic
- **Main Scanning Flow**: `scanAndShowResult` end-to-end
- **Message Passing**: Extension-to-extension communication

## Why Not 70% Coverage?

Chrome extension architecture makes unit testing difficult:
1. **Event-driven**: Most code runs in response to browser events
2. **Async APIs**: Heavy reliance on Chrome APIs (storage, windows, notifications, scripting)
3. **UI Integration**: Many functions interact with browser UI (popups, notifications, context menus)
4. **Service Worker**: Background script runs as a service worker, not a traditional module

**These features require E2E testing with a real browser environment.**

## Running Tests

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

## Future Testing Improvements

### Recommended: E2E Tests with Playwright
To reach 70%+ total coverage, add E2E tests:

```javascript
// Example E2E test setup
import { test, expect } from '@playwright/test';
import path from 'path';

test.beforeEach(async ({ context }) => {
  // Load extension
  await context.addInitScript({ path: path.join(__dirname, '../dist/chrome') });
});

test('should scan selected text via context menu', async ({ page }) => {
  // 1. Load a page
  await page.goto('https://example.com');

  // 2. Select text
  await page.selectText('Some prompt injection attempt');

  // 3. Right-click and select "Scan with Forensicate.ai"
  await page.click('text=Some prompt', { button: 'right' });
  await page.click('text=Scan with Forensicate.ai');

  // 4. Verify result window opens
  const popup = await context.waitForEvent('page');
  await expect(popup.locator('text=Risk Level')).toBeVisible();
});
```

### Alternative: Integration Tests
Test Chrome API interactions with `webextension-polyfill`:

```javascript
import browser from 'webextension-polyfill';

test('should handle SCAN_TEXT message', async () => {
  const response = await browser.runtime.sendMessage({
    type: 'SCAN_TEXT',
    text: 'test prompt'
  });

  expect(response.success).toBe(true);
  expect(response.result).toBeDefined();
});
```

## Test Philosophy

**Current approach: Unit test what's testable, document what needs E2E**

- ✅ Unit tests for pure functions and business logic
- ✅ Mock Chrome APIs for storage/data operations
- ❌ Don't force unit tests on event-driven code
- 📝 Document E2E requirements for future implementation

**41.61% coverage is acceptable for unit tests alone**, given the architectural constraints of Chrome extensions. To reach 70% total coverage, E2E tests are the appropriate next step.
