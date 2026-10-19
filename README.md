# Forensicate.ai

**🌐 Live site: [forensicate.ai](https://forensicate.ai)**
**⭐ GitHub: [github.com/peterhanily/forensicate.ai](https://github.com/peterhanily/forensicate.ai)**

A comprehensive AI security toolkit for analyzing prompts for potential injection vulnerabilities and security risks. Available as a web app, standalone HTML file, and Chrome browser extension.

## Overview

Forensicate.ai provides security analysis capabilities for AI/LLM prompts, helping identify potential injection attacks and other security concerns in prompt engineering workflows. It uses a multi-layered detection system combining keyword matching, regex patterns, heuristic analysis, and NLP-based detection across 182 rules in 24 categories.

## Available Formats

1. **🌐 Web App** - [forensicate.ai](https://forensicate.ai) - Full-featured online version
2. **📦 Standalone HTML** - Single-file offline version (like CyberChef)
3. **🔌 Browser Extensions** - Real-time scanning for Chrome & Firefox
4. **🤖 GitHub Action** - CI/CD prompt injection scanning for PRs
5. **💻 VS Code Extension** - Inline diagnostics in your editor (build from source)

## Browser Extensions

The Forensicate.ai browser extension brings prompt injection detection directly into your browser workflow. Available for both Chrome and Firefox.

### Extension Features

- **🔍 Context Menu Scanning**: Right-click selected text → "Scan with Forensicate.ai"
- **💬 Inline Bubble Results**: Scan results appear in a bubble overlay near your selection
- **💾 Prompt Library**: Save scans for later analysis (up to 1000 items)
- **📋 Scan History**: Track your last 50 scans
- **📤 Export to Web App**: Send saved prompts to forensicate.ai test battery
- **⚡ Instant Analysis**: Results appear within milliseconds
- **🎯 Confidence Scoring**: Same 0-99% confidence algorithm as web app
- **📊 Rule Matches**: See which detection rules triggered

### Extension Installation

**From Browser Stores:**
- **Chrome Web Store**: [Install Forensicate.ai Extension](https://chromewebstore.google.com/detail/forensicateai-prompt-secu/ckohijglmbhlmbpiplcjhnlpijcbkapa)
- Firefox Add-ons: `Coming soon - under review`

**Manual Installation - Chrome (Developer Mode):**
1. Download or clone this repository
2. From the repository root, install dependencies with `pnpm install --frozen-lockfile`, then build with `pnpm build:extensions`
3. Open Chrome and navigate to `chrome://extensions`
4. Enable "Developer mode" (toggle in top-right)
5. Click "Load unpacked"
6. Select `packages/extension/dist/chrome` folder
7. Extension icon appears in toolbar

**Manual Installation - Firefox (Developer Mode):**
1. Download or clone this repository
2. From the repository root, install dependencies with `pnpm install --frozen-lockfile`, then build with `pnpm build:extensions`
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
4. Click "Load Temporary Add-on"
5. Select `packages/extension/dist/firefox/manifest.json` file
6. Extension icon appears in toolbar

### Extension Usage

1. **Scan Text**: Select any text on a webpage, right-click → "Scan with Forensicate.ai"
2. **View Results**: Bubble appears showing confidence score and matched rules
3. **Save Scans**: Click "💾 Save" in bubble to add to library
4. **View Library**: Click extension icon → "💾 View Saved Prompt Library"
5. **Export**: From library page, export prompts to forensicate.ai for batch analysis

## GitHub Action

Scan PRs for prompt injection payloads in code comments, configs, markdown, and documentation:

```yaml
name: Prompt Injection Scan
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: peterhanily/forensicate.ai/packages/github-action@main
        with:
          confidence-threshold: '50'
          fail-on-finding: 'true'
```

Reports findings as GitHub annotations and a markdown summary table. See [packages/github-action/README.md](packages/github-action/README.md) for all options.

## Web App Features

### Prompt Scanner

- **Real-time Analysis**: Auto-scan prompts for injection vulnerabilities with debounced instant results
- **Clickable Annotations**: Matched text segments are highlighted and clickable to show rule details
- **Confidence Scoring**: Logarithmic confidence calculation (0-99%) based on severity-weighted matches
- **Adjustable Threshold**: Confidence threshold slider to control sensitivity (0% disables filtering)
- **Per-Rule Impact**: See each rule's point contribution to the confidence score
- **Detailed Results**: See exactly which rules triggered, why, and how much each contributed
- **Compound Threat Detection**: Identifies multi-vector attacks combining techniques from different categories
- **Visual Highlighting**: Color-coded severity indicators (🟢 Low, 🟡 Medium, 🟠 High, 🔴 Critical)

### Cost Estimator (NEW)

Estimate API costs for testing prompts across multiple LLM providers with Bloomberg terminal-inspired interface:

- **💰 Multi-Provider Cost Analysis**: Compare costs across OpenAI, Anthropic, Google, Mistral, and local models
- **📊 Token Estimation**: Automatic token counting (~4 chars/token approximation)
- **🎯 Provider Comparison**: Side-by-side pricing with cheapest option highlighted
- **📈 Savings Calculator**: Shows cost differences and optimization opportunities
- **🔗 Source Attribution**: Each provider links to official pricing page with verification date
- **⚠️ Accuracy Disclaimers**: Clear warnings about estimation limitations and data freshness
- **🖥️ Terminal-Style UI**: Dark theme with monospace fonts and color-coded data grid
- **📅 Staleness Detection**: Marks a rate stale 30 days after its verification date

**What It Shows:**
- Input/output token breakdown
- Per-provider costs (input/1M, output/1M, total)
- Batch testing cost projections
- Pricing methodology and accuracy notes
- Last verified date for each provider

**Important Notes:**
- Costs are ORDER-OF-MAGNITUDE estimates only, not for budgeting
- Token estimation uses 4 char/token (±25% variance typical)
- Output tokens assumed at 100 (actual varies 10-10,000+)
- Each verified rate shows its own verification date; unverified historical rates are labelled and left out of the default comparison
- Enterprise/volume/regional pricing NOT reflected

### Detection Rules (182 Rules in 24 Categories)

- **Keyword Detection (52 rules)**: Pattern matching for known injection phrases
  - Instruction Override, Jailbreak Personas (DAN, STAN, DUDE, EvilBOT, Maximum)
  - Role Manipulation, Dual Response, System Prompt Extraction
  - Authority Claims, Developer Mode, Context Manipulation
  - Fiction Framing, Emotional Manipulation, Urgency Pressure
  - Compliance Forcing, Output Bypass, Safety Override
  - Threat & Consequence, Restriction Removal, Simulation Framing
  - Piggybacking Injection, Identity Impersonation, Pliny-Style, Crescendo
  - MCP Tool Poisoning, Agent Memory Poisoning, Agent Data Exfiltration
  - Tool Privilege Escalation, AI-Targeted Code Comments, Suspicious Package Install Hooks

- **Regex Pattern Detection (100 rules)**: Advanced pattern matching
  - Ignore/disregard/forget override patterns
  - DAN version patterns, Jailbreak persona names
  - Role assignment and character enforcement
  - Prompt reveal and repeat-above patterns
  - Injection markers, XML tag injection
  - Base64, hex, leetspeak, unicode, homoglyph encoding
  - Markdown, HTML, code comment injection
  - Compliance forcing, safety override, restriction lifting patterns
  - Threat, coercion, AI shutdown, and shaming patterns
  - Simulation framing, piggybacking, creator claims
  - MCP important tag injection, cross-tool injection, fake system prompts
  - Markdown image exfiltration, credential path references, environment variable exfiltration

- **Heuristic Analysis (13 rules)**: Algorithmic pattern detection
  - Shannon Entropy Analysis: Detects encoded payloads via sliding-window entropy
  - Imperative Verb Density: Flags instruction-heavy prompts
  - Nested Delimiter Detection: Catches framing attacks with 3+ delimiter types
  - Language/Script Switching: Detects homoglyph obfuscation via Unicode mixing
  - Sneaky Bits Detection: Invisible binary encoding using Unicode math operators
  - Bidirectional Text Override: Unicode bidi characters that reorder displayed text

- **NLP Analysis (4 rules)**: Natural language processing detection
  - Sentiment Manipulation: AFINN-165 word-level sentiment scoring for coercive tone
  - POS Imperative Detection: compromise.js POS tagging to find imperative sentences (off by default; ordinary instructions also match)
  - Entity Impersonation: NER + keyword matching for authority impersonation attempts
  - Sentence Structure Anomaly: Detects short imperative sentence clustering (off by default for the same reason)

### Rule Management

- Enable/disable individual rules or entire categories
- Edit keyword lists for keyword-based rules
- **Edit any rule**: Change name, description, severity, weight, keywords, or regex pattern
- **Custom confidence weights**: Override severity-based weights per rule (1-100)
- Add custom rules (keyword, regex, or heuristic)
- Create custom rule sections
- View detection logic for any rule

### Test Battery

- Pre-loaded test prompts organized by category:
  - DAN Jailbreaks
  - Prompt Injection
  - Indirect Injection
  - Authority Manipulation
  - Encoding & Obfuscation
  - Benign Samples (for comparison)
- **Batch scanning**: Select multiple prompts and scan them all at once
- Add custom test prompts
- Create custom prompt sections

### Scan History & Analytics

- Session-scoped scan history (last 50 scans)
- Click to re-examine any previous scan
- Analytics dashboard with scan statistics

### Configuration Persistence

- **Automatic localStorage**: All changes auto-save (CyberChef-style)
- **URL Sharing**: Share configuration via URL (includes rules, prompts, and current prompt)
- **Works in Standalone**: Persistence works in both server and offline modes
- **Export/Import JSON**: Manual configuration backup/restore
  - Choose to import rules, prompts, or both
  - Replace or merge modes
  - Preview imported data before applying
- **Reset to Defaults**: One-click reset option

### Community Rules

Browse and import detection rules contributed by the community directly in the web app.

**Using Community Rules:**
- Switch to the "Community" tab in the Rules Panel
- Browse rules by category or search by keyword
- Click a rule to see examples, references, and details
- Import rules with one click to add them to your custom rules

**Contributing Your Own Rules:**

Help improve Forensicate.ai by contributing detection rules for new attack patterns! Community contributions are welcomed via GitHub Pull Requests.

1. **Fork the repository** on GitHub
2. **Create a new rule file** in `community-rules/rules/[category]/`
3. **Follow the schema** defined in `community-rules/SCHEMA.md`
4. **Test your rule** thoroughly with examples
5. **Submit a Pull Request** with your rule

For detailed contribution guidelines, see: [community-rules/README.md](community-rules/README.md)

**Why contribute?**
- Help the community detect new injection techniques
- Share your security research findings
- Get recognition with author attribution
- Improve AI safety for everyone

**Quality Standards:**
- Rules must have clear descriptions and examples
- Must avoid false positives on common benign phrases
- Should target specific attack patterns or techniques
- Include references to source material where applicable

Community rules are reviewed by maintainers before being added to the index and automatically distributed to all users.

### Standalone/Offline Mode

- Download as single self-contained HTML file (like CyberChef)
- Works completely offline in any browser
- No installation or server required
- Click "Download" button in the header

### Mobile Responsive

- Fully responsive design for mobile devices
- Collapsible Rules and Test Battery panels on mobile
- Touch-friendly toggle buttons
- Adaptive layout that works on any screen size

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS 4
- **Routing**: React Router DOM 7
- **NLP**: compromise.js (POS tagging, NER) + AFINN-165 (sentiment)
- **Testing**: Vitest + React Testing Library + pytest
- **Package Manager**: pnpm (monorepo with workspaces)
- **API**: Cloudflare Workers
- **Python**: Zero-dependency scanner (stdlib only)
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 24.13 or later in the 24.x LTS line
- pnpm 10.29.1 (pinned in `package.json`)
- Python 3.10+ for the Python source and tests

### Installation

```bash
pnpm install --frozen-lockfile
pnpm --filter @forensicate/scanner build
```

### Development

```bash
# Run web app
pnpm dev

# Or run from app package
cd packages/app
pnpm dev
```

The app will be available at `http://localhost:5173`

### Testing

Test suites cover the web app, scanner engine, REST API, Python source, browser extension, and GitHub Action. Use the test runner output for current test counts and results.

```bash
# Run JS/TS tests
pnpm test

# Run Python tests
cd packages/python && PYTHONPATH=src python3 -m pytest tests/ -v

# Run tests for specific package
pnpm --filter @forensicate/scanner test
pnpm --filter @forensicate/app test
```

### Building

```bash
# Build web app
pnpm build

# Build browser extension
cd packages/extension
pnpm build
```

## Project Structure

```
forensicate_ai/
├── packages/
│   ├── app/                     # Web application (React 19 + Vite 8)
│   │   ├── src/
│   │   │   ├── components/      # UI components
│   │   │   ├── pages/           # Scanner.tsx — main page
│   │   │   ├── hooks/           # React hooks
│   │   │   ├── lib/             # Utilities, pricing, file extractors
│   │   │   └── data/            # Sample test prompts & file test battery
│   │   └── tests/               # UI, storage, and file extraction tests
│   │
│   ├── scanner/                 # Internal TypeScript scanner engine
│   │   ├── src/
│   │   │   ├── scanner.ts       # Core scanPrompt() function
│   │   │   ├── rules.ts         # Keyword and regex rules
│   │   │   ├── heuristicRules.ts # Heuristic rules
│   │   │   ├── nlpRules.ts      # 4 NLP rules (compromise.js)
│   │   │   ├── fileRules.ts     # 13 file-based rules
│   │   │   ├── compoundDetector.ts
│   │   │   └── types.ts
│   │   └── tests/               # Scanner engine tests
│   │
│   ├── python/                  # Python scanner source
│   │   ├── src/forensicate/     # 87 rules (keyword, regex, heuristic)
│   │   │   ├── scanner.py       # scan_prompt() function
│   │   │   ├── rules.py         # All keyword + regex rules
│   │   │   ├── heuristics.py    # 4 heuristic functions
│   │   │   ├── compound.py      # Compound threat detection
│   │   │   └── cli.py           # CLI entry point
│   │   └── tests/               # Python scanner and CLI tests
│   │
│   ├── github-action/           # GitHub Action for CI/CD scanning
│   │   ├── action.yml           # Action definition
│   │   └── scan.mjs             # Scan script
│   │
│   ├── extension/               # Browser extension (Chrome + Firefox MV3)
│   │   ├── src/                 # background.js, content.js, popup
│   │   ├── pages/               # library, history, result pages
│   │   └── tests/               # Background, storage, and scanning tests
│   │
│   ├── api/                     # REST API (Cloudflare Workers)
│   │   └── src/                 # auth, rate limiter, scan handler
│   │   └── src/__tests__/       # API request and authorization tests
│   │
│   └── vscode/                  # VS Code extension
│       └── src/                 # diagnostics, commands, result panel
│
├── scripts/verify-rules.js      # Rule count consistency checker
├── .github/workflows/           # CI, deploy, pricing-check
├── pnpm-workspace.yaml          # Monorepo workspace config
└── README.md
```

## Acknowledgments

### AI-Assisted Development

This project was developed as an **AI-assisted proof of concept** (vibe coded) using:
- **GitHub Copilot** (Codex by OpenAI)
- **Claude** (by Anthropic)
- **Claude Code** (CLI tool by Anthropic)

These tools assisted with code generation, testing, optimization, and documentation throughout the development process.

### Detection Rules & Research Sources

The detection rules and test prompts were informed by research and datasets from:

- **OWASP** - Web application security patterns and injection attack vectors
- **Lakera** - AI security research and prompt injection taxonomy
- **jailbreakchat.com** - Community-sourced jailbreak techniques and examples
- **Plinny the Liberator** - AI security researcher, prompt injection research and jailbreak examples
- **GitHub Security Research** - Open-source prompt injection datasets including:
  - [Awesome ChatGPT Prompts](https://github.com/f/awesome-chatgpt-prompts)
  - [LLM Security](https://github.com/verazuo/awesome-llm-security)
  - [Prompt Injection Defenses](https://github.com/tldrsec/prompt-injection-defenses)
  - Various academic and community jailbreak collections
- **Academic Papers** - Research on adversarial prompts, jailbreaking, and LLM security
- **compromise.js** - Natural language processing library by Spencer Kelly
- **AFINN-165** - Sentiment analysis word list by Finn Årup Nielsen

### Special Thanks

Thanks to the security research community for openly sharing their findings, enabling tools like this to help improve AI safety.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
