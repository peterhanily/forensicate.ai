# Forensicate.ai

**Live site: [forensicate.ai](https://forensicate.ai)**

A web-based AI security tool for analyzing prompts for potential injection vulnerabilities and security risks.

## Overview

Forensicate.ai provides security analysis capabilities for AI/LLM prompts, helping identify potential injection attacks and other security concerns in prompt engineering workflows. It uses a multi-layered detection system combining keyword matching, regex patterns, heuristic analysis, and NLP-based detection across 78 rules in 15 categories.

## Features

### Prompt Scanner

- **Real-time Analysis**: Auto-scan prompts for injection vulnerabilities with debounced instant results
- **Confidence Scoring**: Logarithmic confidence calculation (0-99%) based on severity-weighted matches
- **Adjustable Threshold**: Confidence threshold slider to control sensitivity (0% disables filtering)
- **Per-Rule Impact**: See each rule's point contribution to the confidence score
- **Detailed Results**: See exactly which rules triggered, why, and how much each contributed
- **Compound Threat Detection**: Identifies multi-vector attacks combining techniques from different categories

### Detection Rules (78 Rules in 15 Categories)

- **Keyword Detection (29 rules)**: Pattern matching for known injection phrases
  - Instruction Override, Jailbreak Personas (DAN, STAN, DUDE, EvilBOT, Maximum)
  - Role Manipulation, Dual Response, System Prompt Extraction
  - Authority Claims, Developer Mode, Context Manipulation
  - Fiction Framing, Emotional Manipulation, Urgency Pressure
  - Compliance Forcing, Output Bypass, Safety Override
  - Threat & Consequence, Restriction Removal, Simulation Framing
  - Piggybacking Injection, Identity Impersonation, Pliny-Style, Crescendo

- **Regex Pattern Detection (41 rules)**: Advanced pattern matching
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

- **Heuristic Analysis (4 rules)**: Algorithmic pattern detection
  - Shannon Entropy Analysis: Detects encoded payloads via sliding-window entropy
  - Imperative Verb Density: Flags instruction-heavy prompts
  - Nested Delimiter Detection: Catches framing attacks with 3+ delimiter types
  - Language/Script Switching: Detects homoglyph obfuscation via Unicode mixing

- **NLP Analysis (4 rules)**: Natural language processing detection
  - Sentiment Manipulation: AFINN-165 word-level sentiment scoring for coercive tone
  - POS Imperative Detection: compromise.js POS tagging to find imperative sentences
  - Entity Impersonation: NER + keyword matching for authority impersonation attempts
  - Sentence Structure Anomaly: Detects short imperative sentence clustering

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
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **Routing**: React Router DOM 7
- **NLP**: compromise.js (POS tagging, NER) + AFINN-165 (sentiment)
- **Testing**: Vitest + React Testing Library
- **Package Manager**: pnpm (monorepo with workspaces)

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm

### Installation

```bash
pnpm install
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

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/app
pnpm test

# Run tests in watch mode
pnpm test:watch
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
│   ├── app/                     # Web application
│   │   ├── src/
│   │   │   ├── components/      # UI components
│   │   │   │   ├── AnnotatedPrompt.tsx
│   │   │   │   ├── RulesPanel.tsx
│   │   │   │   ├── TestBatteryPanel.tsx
│   │   │   │   └── ...
│   │   │   ├── pages/
│   │   │   │   └── Scanner.tsx  # Main scanner page
│   │   │   ├── hooks/           # React hooks
│   │   │   │   └── usePersistedConfig.ts
│   │   │   ├── lib/             # Utilities
│   │   │   │   └── storage/     # Persistence layer
│   │   │   ├── data/            # Test prompts
│   │   │   └── main.tsx         # Entry point
│   │   ├── tests/               # 188 tests
│   │   └── public/              # Static assets
│   │
│   ├── scanner/                 # Scanner engine (shared)
│   │   ├── src/
│   │   │   ├── scanner.ts       # Core scanning logic
│   │   │   ├── rules.ts         # 78 detection rules
│   │   │   ├── heuristicRules.ts
│   │   │   ├── nlpRules.ts
│   │   │   ├── compoundDetector.ts
│   │   │   └── types.ts
│   │   └── tests/               # 78 tests
│   │
│   └── extension/               # Chrome extension
│       ├── src/
│       │   ├── background.js    # Service worker
│       │   └── manifest.json
│       ├── pages/               # Extension pages
│       │   ├── result.html
│       │   ├── library.html
│       │   └── history.html
│       └── tests/               # 22 tests
│
├── pnpm-workspace.yaml          # Workspace configuration
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
