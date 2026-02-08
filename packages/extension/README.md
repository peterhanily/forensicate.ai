# Forensicate.ai Browser Extension

Browser extension for scanning text with Forensicate.ai's prompt injection detection engine.

## Features

✅ **Context Menu Scanning** - Right-click any selected text → "Scan with Forensicate.ai"
✅ **Inline Bubble Results** - Scan results appear in a bubble overlay near your selection
✅ **Keyboard Shortcut** - Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) to scan selected text
✅ **Prompt Library** - Save scanned prompts to your local library (up to 1000 items)
✅ **Scan History** - View your last 50 scans with full details
✅ **Export to Web App** - Send saved prompts to forensicate.ai test battery
✅ **Offline Capable** - All scanning happens locally in your browser
✅ **Privacy First** - No data sent to external servers
✅ **Storage Management** - Automatic cleanup when storage quota exceeds 80%

## Installation

### Chrome (Developer Mode)

1. Build the extension:
   ```bash
   pnpm --filter @forensicate/extension build
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked"

5. Select the directory:
   ```
   packages/extension/dist/chrome
   ```

6. The extension is now installed! Look for the Forensicate.ai icon in your toolbar.

### Firefox (Temporary)

1. Build the extension for Firefox:
   ```bash
   pnpm --filter @forensicate/extension build:firefox
   ```

2. Open Firefox and go to `about:debugging#/runtime/this-firefox`

3. Click "Load Temporary Add-on"

4. Navigate to and select:
   ```
   packages/extension/dist/firefox/manifest.json
   ```

5. The extension will remain installed until you close Firefox.

## Usage

### Scan Selected Text

1. **Select any text** on any webpage
2. **Right-click** and choose "Scan with Forensicate.ai"
3. A popup window opens showing:
   - Confidence score (0-99%)
   - Risk level (Low/Medium/High)
   - Matched rules
   - Detected patterns

### Keyboard Shortcut

1. Select text
2. Press `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac)
3. Scan result opens automatically

### Extension Popup

Click the Forensicate.ai icon in your toolbar to see:
- **Total scans** performed
- **Saved prompts** count
- **Prompt library** breakdown (High/Medium/Low risk)
- Quick actions (View Library, View History, Open Web App)

### Save to Library

After scanning, click **"Save to Library"** in the result window to:
- Store the prompt for later reference
- Build your test battery
- Track patterns over time

## Build & Development

### Build for Chrome
```bash
pnpm --filter @forensicate/extension build
# or
pnpm --filter @forensicate/extension build:chrome
```

### Build for Firefox
```bash
pnpm --filter @forensicate/extension build:firefox
```

### Package for Distribution
```bash
# Chrome Web Store
pnpm --filter @forensicate/extension package:chrome
# Output: packages/extension/dist/forensicate-chrome.zip

# Firefox Add-ons
pnpm --filter @forensicate/extension package:firefox
# Output: packages/extension/dist/forensicate-firefox.zip
```

## Architecture

```
extension/
├── src/
│   ├── manifest.json          # Extension configuration
│   ├── background.js          # Service worker (includes scanner)
│   ├── popup.html/js          # Extension popup UI
│
├── pages/
│   ├── result.html/js         # Scan result page
│
├── scripts/
│   └── build.js               # Build script (bundles scanner)
│
└── dist/
    ├── chrome/                # Chrome build output
    └── firefox/               # Firefox build output
```

## Scanner Integration

The extension bundles the `@forensicate/scanner` package, which includes:
- 78 detection rules (keyword, regex, heuristic, NLP)
- 15 rule categories
- AFINN-165 sentiment analysis
- compromise.js for NLP
- ~760KB bundled size

All scanning happens **locally in your browser** - no external API calls required.

## Permissions

The extension requests these permissions:

- **contextMenus** - Add "Scan with Forensicate.ai" to right-click menu
- **storage** - Save scan history and prompt library locally
- **activeTab** - Access selected text on active tab (only when you trigger scan)

**Note:** The extension does NOT request broad site access. It only accesses text when you explicitly trigger a scan.

## Privacy

- ✅ All scanning happens **locally** in your browser
- ✅ No data sent to external servers
- ✅ No analytics or tracking
- ✅ Scan history stored **only on your device**
- ✅ You can clear all data anytime (browser's extension settings)

## File Sizes

- **Total extension**: ~800 KB
- **Background script**: ~760 KB (includes scanner + compromise.js)
- **Popup**: ~6 KB
- **Result page**: ~8 KB

## Browser Compatibility

- **Chrome**: 96+ (Manifest V3)
- **Edge**: 96+ (Chromium-based)
- **Firefox**: 109+ (Manifest V3 support)
- **Opera**: 82+ (Chromium-based)

## What's New (v1.0)

✅ **Bubble Dialog** - Scan results appear inline near selected text
✅ **Full Library Page** - Search, filter, view, and manage saved prompts
✅ **Full History Page** - View and manage last 50 scans with save-to-library
✅ **Export to Web App** - Export entire library to forensicate.ai test battery
✅ **Proper PNG Icons** - Professional 16x16, 48x48, 128x128 icons
✅ **Storage Quota Management** - Automatic cleanup prevents data loss
✅ **Custom Modal Dialogs** - Native-styled confirmation dialogs
✅ **22 Unit Tests** - Comprehensive test coverage

## Roadmap

### v1.1 (Next)
- [ ] Settings page (confidence threshold, auto-scan, storage limits)
- [ ] Badge showing confidence score on toolbar icon
- [ ] Import test battery from file
- [ ] Dark/light theme toggle
- [ ] Rule enable/disable in extension

### v1.2 (Future)
- [ ] Auto-scan on LLM chat interfaces (ChatGPT, Claude, etc.)
- [ ] Custom keyboard shortcut configuration
- [ ] Pin favorite prompts in library
- [ ] Annotation highlighting in extension results

### v2.0 (Long-term)
- [ ] Sync library across devices (Chrome Sync API)
- [ ] Custom rule editor in extension
- [ ] Rule presets (Lakera, OWASP, etc.)
- [ ] Real-time scanning as you type

## Contributing

See main project [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 - see [LICENSE](../../LICENSE) for details.

## Support

- **Issues**: https://github.com/peterhanily/forensicate.ai/issues
- **Web App**: https://forensicate.ai
- **Documentation**: https://github.com/peterhanily/forensicate.ai/tree/main/docs
