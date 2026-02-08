# Forensicate.ai Chrome Extension - Code Review Guide

**For Chrome Web Store Reviewers**

This document explains the extension architecture and addresses common review questions.

---

## Extension Overview

Forensicate.ai is a **privacy-first** prompt injection scanner that:
- Runs **100% locally** in the browser (no external API calls)
- Scans user-selected text for security vulnerabilities
- Uses a bundled detection engine with dozens of static rules
- **Never transmits data** to external servers

---

## Architecture

### Background Script (`background.js`)

The background script is a **bundled artifact** from `@forensicate/scanner` package that includes:

1. **Detection Engine**
   - Dozens of static detection rules (keywords, regex, heuristics, NLP)
   - AFINN-165 sentiment analysis dictionary (static wordlist)
   - compromise.js NLP library (part-of-speech tagging)

2. **Rule Categories**
   - Keyword-based rules (pattern matching for known injection phrases)
   - Regex pattern rules (advanced pattern matching)
   - Heuristic rules (entropy analysis, imperative density, delimiter detection)
   - NLP rules (sentiment analysis, POS tagging, entity recognition)

3. **No Remote Code Execution**
   - All rules are **statically defined** at build time
   - No `eval()`, `Function()`, or dynamic code generation
   - No external API calls or data transmission
   - Scanner runs entirely client-side

### Why It's Bundled

The scanner is bundled using **esbuild** for:
- **Performance**: Single file reduces load time
- **Dependency Management**: Includes compromise.js and AFINN-165 data
- **Consistency**: Same engine used in web app and extension

**Source Code Available**: Full unminified source at https://github.com/peterhanily/forensicate.ai

---

## File Structure

```
extension/
├── background.js (438 KB)  ← Bundled scanner engine
│   ├── 78 detection rules (static)
│   ├── compromise.js (NLP library)
│   └── AFINN-165 sentiment dictionary
│
├── content.js (injected on-demand)
│   └── Displays scan results bubble
│
├── popup.html/js
│   └── Extension popup UI
│
└── pages/
    ├── library.html/js  ← Saved prompts (localStorage)
    ├── history.html/js  ← Scan history (localStorage)
    └── result.html/js   ← Full scan results
```

---

## Security & Privacy

### Data Flow

1. **User selects text** on any webpage
2. **User triggers scan** (right-click or Ctrl+Shift+S)
3. **Text analyzed locally** using bundled scanner
4. **Results displayed** in bubble overlay
5. **Optional: User saves to library** (chrome.storage.local only)

### No External Communication

- ✅ **No network requests** (except optional export to forensicate.ai)
- ✅ **No tracking or analytics**
- ✅ **No third-party services**
- ✅ **No remote configuration**

### Data Storage

All data stored **locally on user's device** via `chrome.storage.local`:
- Scan history (last 50 scans)
- Prompt library (up to 1000 items)
- User can delete anytime

---

## Permissions Justification

### Required Permissions

| Permission | Purpose | Usage |
|------------|---------|-------|
| `activeTab` | Read selected text when user triggers scan | Only activates on explicit user action (right-click or keyboard shortcut) |
| `scripting` | Inject bubble overlay to display results | Injects content.js dynamically when scan is triggered |
| `storage` | Save scan history and prompt library locally | All data stays on device, never synced or uploaded |
| `contextMenus` | Add "Scan with Forensicate.ai" to right-click menu | Creates context menu item only |
| `alarms` | Periodic storage cleanup | Cleans up old scans every hour to prevent quota issues |

### No Broad Host Permissions

- ❌ **No `host_permissions`** required
- ❌ **No `content_scripts` with broad matches**
- ✅ Uses **activeTab + dynamic injection** (Chrome recommended approach)

---

## Detection Rules

### Rule Types and Examples

The extension uses **dozens of static detection rules** across multiple categories:

**Keyword Rules:**
- Instruction Override, Jailbreak Personas (DAN, STAN, etc.)
- Role Manipulation, System Prompt Extraction
- Authority Claims, Developer Mode
- Safety Override, Threat & Consequence
- And many more...

**Regex Pattern Rules:**
- Ignore/disregard patterns
- DAN version patterns
- Role assignment patterns
- Encoding detection (base64, hex, leetspeak)
- Injection markers
- And many more...

**Heuristic Rules:**
- Shannon Entropy Analysis
- Imperative Verb Density
- Nested Delimiter Detection
- Language/Script Switching

**NLP Rules:**
- Sentiment Manipulation (AFINN-165)
- POS Imperative Detection (compromise.js)
- Entity Impersonation (NER)
- Sentence Structure Anomaly

Rules are statically defined in the bundled scanner and can be verified in the source code at:
https://github.com/peterhanily/forensicate.ai/tree/main/packages/scanner/src

**Note:** Rules are continuously updated and expanded to improve detection accuracy.

---

## Optional Data Export

The extension includes an **optional** feature to export saved prompts:

1. User opens Prompt Library page
2. User clicks **"Export to Test Battery"**
3. Confirmation dialog warns: *"Your prompts will be included in the URL"*
4. If user confirms, opens forensicate.ai with data in URL parameter
5. **User must explicitly consent** - no automatic transmission

This is the **only** time data leaves the device, and it's:
- ✅ **Completely optional**
- ✅ **User-initiated**
- ✅ **With explicit warning**
- ✅ **To our own domain** (forensicate.ai)

---

## Testing

To verify the extension behavior:

1. **Install extension** in Developer Mode
2. **Open DevTools** (F12) → Network tab
3. **Trigger multiple scans** on different websites
4. **Verify**: ✅ No external network requests (except forensicate.ai if user exports)

---

## Open Source

Full source code available at:
https://github.com/peterhanily/forensicate.ai

- **License**: Apache 2.0
- **Web App**: https://forensicate.ai
- **Privacy Policy**: https://forensicate.ai/extension-privacy.html

---

## Contact

For review questions or clarifications:
- **GitHub Issues**: https://github.com/peterhanily/forensicate.ai/issues
- **Email**: via GitHub profile

---

**Thank you for reviewing Forensicate.ai!**

This extension helps users identify potential security risks in AI prompts while maintaining complete privacy and security.
