# Privacy Policy - Forensicate.ai Chrome Extension

**Last Updated: February 8, 2026**

## Overview

Forensicate.ai is committed to protecting your privacy. This extension performs all prompt injection scanning **locally in your browser** and does not collect, transmit, or store any personal data on external servers.

## Data Collection

### What We DO NOT Collect

- ❌ We do NOT collect personal information
- ❌ We do NOT track your browsing activity
- ❌ We do NOT send data to external servers
- ❌ We do NOT use analytics or telemetry
- ❌ We do NOT sell or share any data
- ❌ We do NOT access your data unless you explicitly trigger a scan

### What We Store Locally

The extension stores the following data **only on your device** using Chrome's local storage API:

1. **Scan History** (up to 50 items)
   - Text you explicitly scanned
   - Scan results (confidence score, matched rules)
   - Source URL (page where text was scanned)
   - Timestamp

2. **Prompt Library** (up to 1000 items)
   - Prompts you explicitly saved
   - Associated scan results
   - Source URL
   - Timestamp

All data is stored locally using `chrome.storage.local` and never leaves your device unless you explicitly choose to export it.

## Permissions

The extension requests the following permissions:

### contextMenus
- **Why**: To add "Scan with Forensicate.ai" to your right-click menu
- **Usage**: Creates the context menu item only

### storage
- **Why**: To save your scan history and prompt library locally on your device
- **Usage**: All data stays on your device; nothing is synced or uploaded

### activeTab
- **Why**: To access selected text when you trigger a scan
- **Usage**: Only activates when you explicitly right-click → "Scan with Forensicate.ai" or use the keyboard shortcut
- **Important**: We do NOT have access to any tab content unless you explicitly trigger a scan

## How Scanning Works

1. You select text on a webpage
2. You right-click and choose "Scan with Forensicate.ai" (or press Ctrl+Shift+S)
3. The extension reads the selected text
4. All analysis happens **locally in your browser** using the bundled detection engine
5. Results are displayed in a bubble overlay
6. Nothing is sent to any server

## Third-Party Services

This extension does NOT use any third-party services, analytics, or tracking tools. The detection engine (78 rules, NLP processing) is entirely bundled within the extension and runs locally.

## Data Export

You can voluntarily export your saved prompts to the forensicate.ai web app by:
1. Opening the Prompt Library page
2. Clicking "Export to Test Battery"
3. The data is encoded in a URL parameter and sent to forensicate.ai

This export is **entirely optional** and only happens when you explicitly click the export button.

## Data Deletion

You can delete all extension data at any time:

### Delete Individual Items
- Open Library or History page
- Click the delete button on any item

### Clear All Data
1. Open Library page → Click "Clear All"
2. Open History page → Click "Clear History"

### Complete Removal
1. Remove the extension from Chrome
2. All stored data is automatically deleted

## Data Retention

- **Scan History**: Automatically limited to last 50 scans
- **Prompt Library**: Up to 1000 items, automatically cleaned when storage exceeds 80% of quota
- **Automatic Cleanup**: Extension manages storage limits to prevent data loss

## Changes to Privacy Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Contact

If you have questions or concerns about privacy:
- **GitHub Issues**: https://github.com/peterhanily/forensicate.ai/issues
- **Website**: https://forensicate.ai

## Open Source

This extension is open source under the Apache 2.0 license. You can review the complete source code at:
https://github.com/peterhanily/forensicate.ai

## Compliance

- ✅ **GDPR Compliant**: No personal data collected or processed
- ✅ **CCPA Compliant**: No personal information sold or shared
- ✅ **Chrome Web Store Policies**: Full compliance with data usage policies
- ✅ **Manifest V3**: Uses latest Chrome extension security standards

---

**Summary**: This extension is completely private. All scanning happens on your device, no data is sent anywhere, and you have full control over what's saved.
