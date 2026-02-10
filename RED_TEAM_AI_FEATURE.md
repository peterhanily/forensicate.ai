# Red Team AI - Automated Adversarial Testing

## 🎯 Overview

The Red Team AI is a breakthrough feature that **automatically discovers detection blind spots** by generating novel prompt injection attacks and testing them against your current rule set. This is the first tool in the market to offer autonomous adversarial testing for prompt injection detection systems.

## 🚀 What Makes This Unique

**Industry First**: No other prompt injection detection tool offers automated adversarial testing that:
- Generates novel attacks using AI
- Tests them against your actual rules
- Identifies specific vulnerabilities
- Auto-suggests new rules to patch gaps

**Key Innovation**: Instead of manually creating test cases, the AI:
1. Studies your current detection rules
2. Generates creative attacks designed to bypass them
3. Tests each attack to measure effectiveness
4. Reports exactly where your defenses are weak
5. Proposes specific rules to close the gaps

## ✨ Features

### 1. AI-Powered Attack Generation
- Uses LLM (OpenAI, Anthropic, or local models) to generate attacks
- Supports 10 attack techniques:
  - **Paraphrasing**: Rephrases known attacks to evade keyword detection
  - **Encoding**: Base64, ROT13, Unicode tricks
  - **Social Engineering**: Authority claims, urgency tactics
  - **Hypothetical Framing**: "What if", academic discussion framing
  - **Context Manipulation**: Instruction override attempts
  - **Role Confusion**: Persona/character jailbreaks
  - **Translation**: Multi-language attacks
  - **Token Smuggling**: Hidden instructions in unusual formats
  - **Multi-Turn**: Attacks split across conversation turns
  - **Compound**: Multi-vector sophisticated attacks

### 2. Ground Truth Validation
- Actually tests generated attacks against your scanner
- Measures real bypass rates, not theoretical vulnerabilities
- Confidence-based bypass detection (configurable threshold)

### 3. Vulnerability Analysis
- **Security Grade**: A-F score based on bypass rate
  - A (< 10%): Excellent security posture
  - B (10-25%): Good coverage
  - C (25-50%): Fair, needs improvement
  - D (50-75%): Poor, significant gaps
  - F (75%+): Critical vulnerabilities
- **Vulnerable Categories**: Identifies attack types with weak coverage
- **Pattern Analysis**: Which techniques are most effective at bypassing

### 4. Auto-Generated Rule Suggestions
- Analyzes successful bypasses
- Extracts common patterns
- Generates candidate detection rules
- Shows confidence level and reasoning
- One-click approval to add to your rule set

### 5. Detailed Reporting
- Complete attack log with results
- Per-attack reasoning (why it bypassed or didn't)
- Technique effectiveness comparison
- Priority actions list
- Historical tracking (coming soon)

## 🔧 Configuration

### Attack Generator Options

**Provider Selection:**
- **Local (Demo Mode)**: Mock attacks for testing without API costs
- **OpenAI GPT-4**: High-quality creative attacks ($0.0025/attack)
- **Anthropic Claude**: Reasoning-focused attacks ($0.0015/attack)

**Attacks Per Run:**
- Range: 5-50 attacks
- 5-10: Quick vulnerability check (~$0.01-0.02)
- 20-30: Thorough assessment (~$0.05-0.08)
- 40-50: Comprehensive audit (~$0.10-0.13)

**Techniques:**
- Select which attack types to test
- Recommended: Enable 5-7 techniques for balanced coverage
- Advanced: Enable all 10 for maximum thoroughness

**Bypass Threshold:**
- Confidence % below which attack = successful bypass
- Default: 50% (industry standard)
- Stricter: 30-40% (higher security bar)
- Looser: 60-70% (focus on obvious gaps)

## 📊 How to Use

### Basic Workflow

1. **Open Scanner Page** - Red Team panel appears at bottom of center column

2. **Configure Test** (optional)
   - Click "Show Config" to customize settings
   - Select provider (or use Local for demo)
   - Choose number of attacks (start with 10)
   - Select techniques to test

3. **Run Test**
   - Click "▶ Run Red Team Test"
   - Wait ~30-60 seconds for generation + testing
   - View results summary

4. **Review Results**
   - Check security grade (A-F)
   - Identify vulnerable categories
   - Review suggested rules
   - Examine detailed attack log

5. **Take Action**
   - Approve suggested rules (one-click)
   - Manually add rules for specific gaps
   - Re-run test to verify improvements

### Advanced Workflow

**Continuous Security Monitoring:**
```
1. Run weekly Red Team tests
2. Track security grade over time
3. Alert if grade drops below threshold
4. Automatically import community rules
5. Re-test to measure improvement
```

**Pre-Deployment Validation:**
```
1. Add new custom detection rules
2. Run Red Team test (50 attacks, all techniques)
3. Verify bypass rate < 10%
4. Fix any critical findings
5. Deploy with confidence
```

## 💡 Example Results

### Good Security Posture (Grade A)
```
Total Attacks: 30
Successful Bypasses: 2
Bypass Rate: 6.7%
Security Grade: A (Excellent)

Vulnerable Categories: None
Suggested Rules: 1 (preventive)
```

### Needs Improvement (Grade C)
```
Total Attacks: 30
Successful Bypasses: 12
Bypass Rate: 40%
Security Grade: C (Fair)

Vulnerable Categories:
  - Context Injection
  - Encoding Attacks

Suggested Rules: 3 (high confidence)
  - Encoding Detection (catches 4 bypasses)
  - Context Manipulation Pattern (catches 5 bypasses)
  - Social Engineering Indicators (catches 3 bypasses)
```

## 🔒 Security & Privacy

**API Key Security:**
- Stored locally in browser only
- Encrypted at rest (SubtleCrypto API)
- Never sent to forensicate.ai servers
- Never included in exports or share URLs

**Direct API Calls:**
- All LLM requests go directly from your browser to provider
- No forensicate.ai server in the middle
- Zero data collection

**Test Attacks:**
- Generated for research purposes only
- Not actual harmful content
- Designed to test detection, not cause harm
- Ethical red team research boundaries enforced

## 📈 Cost Estimation

**Token Usage:**
- ~500 tokens per attack generation
- Input + output combined

**Pricing Examples (OpenAI GPT-4o):**
- 10 attacks: $0.0125 (~$0.01)
- 30 attacks: $0.0375 (~$0.04)
- 50 attacks: $0.0625 (~$0.06)

**Cheaper Alternatives:**
- Anthropic Claude Haiku: 60% cheaper
- Local models (Ollama): Free (compute only)
- Demo mode: $0 (mock attacks)

## 🛠️ Technical Architecture

### File Structure
```
packages/app/src/
├── lib/redteam/
│   ├── types.ts              # TypeScript interfaces
│   ├── attackGenerator.ts    # LLM-powered attack generation
│   ├── redTeamEngine.ts      # Core testing engine
│   └── index.ts              # Public API
└── components/
    └── RedTeamPanel.tsx      # React UI component
```

### Key Components

**AttackGenerator:**
- Builds prompts for LLM to generate attacks
- Calls provider API (OpenAI, Anthropic, local)
- Parses JSON responses
- Novelty detection (avoid duplicates)

**RedTeamEngine:**
- Orchestrates full test run
- Runs attacks through scanner
- Analyzes bypass patterns
- Generates rule suggestions
- Produces vulnerability reports

**RedTeamPanel (UI):**
- Configuration interface
- Progress tracking
- Results visualization
- Suggested rule approval

## 🎯 Roadmap

### Phase 1 (Current - Week 1)
- ✅ Basic attack generation
- ✅ OpenAI + Anthropic providers
- ✅ Vulnerability grading
- ✅ Rule suggestion engine
- ✅ Demo mode for testing

### Phase 2 (Week 2-3)
- [ ] Historical tracking (track improvements over time)
- [ ] Regression detection (alert on new vulnerabilities)
- [ ] Multi-provider comparison (test across OpenAI + Claude + local)
- [ ] Advanced pattern extraction (better rule suggestions)
- [ ] Export PDF/CSV reports

### Phase 3 (Week 4+)
- [ ] Scheduled testing (daily/weekly automation)
- [ ] Community threat intelligence (share findings)
- [ ] Live attack validation (test against real LLMs)
- [ ] Behavioral analysis (response monitoring)
- [ ] Enterprise features (team dashboards, SSO)

## 📚 Research Background

This feature implements cutting-edge research in:

**Adversarial Machine Learning:**
- Automated vulnerability discovery
- Evasion technique generation
- Robustness testing

**LLM Security:**
- OWASP LLM Top 10 2025 compliance
- Prompt injection taxonomy
- Defense-in-depth strategies

**Red Team Automation:**
- AI-as-adversary paradigm
- Continuous security testing
- Proactive defense

## 🏆 Competitive Advantage

**vs. Promptfoo:**
- Promptfoo: Manual test case creation
- Forensicate: Automated AI generation ✅

**vs. Garak (NVIDIA):**
- Garak: Static vulnerability scanning
- Forensicate: Dynamic bypass testing ✅

**vs. Mindgard:**
- Mindgard: Expensive closed-source ($$$)
- Forensicate: Open source Apache 2.0 ✅

**vs. Manual Testing:**
- Manual: Hours of human effort
- Forensicate: 60 seconds automated ✅

## 🎓 Learn More

**Related Documentation:**
- [NEXT_LEVEL_STRATEGY_2026.md](NEXT_LEVEL_STRATEGY_2026.md) - Full strategic vision
- [README.md](README.md) - Main project documentation
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

**Academic Papers:**
- "Adversarial Testing for LLM Security" (coming soon)
- "Automated Red Team AI" (in progress)

## 🤝 Contributing

Want to improve Red Team AI?

**Ideas:**
- New attack techniques
- Better pattern extraction
- Enhanced rule suggestion logic
- Provider integrations (Google, Mistral, etc.)
- Historical tracking UI

**Submit:**
- GitHub issues for bugs
- Pull requests for features
- Community attack techniques

---

**Built with ❤️ by the Forensicate.ai team**

*Making AI security testing accessible to everyone*
