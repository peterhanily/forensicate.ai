import { Link } from 'react-router-dom';

const FEATURES = [
  {
    title: 'Prompt Scanner',
    desc: '168 detection rules across keyword, regex, heuristic, NLP, and file-based analysis. Real-time confidence scoring with OWASP and MITRE ATLAS compliance mapping.',
    link: '/scanner',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    ),
  },
  {
    title: 'Mutation Engine',
    desc: 'Test your defenses with 10 evasion strategies, composable pipelines, and evolutionary mutation. Auto-suggests new rules to close detection gaps.',
    link: '/mutate',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
    ),
  },
  {
    title: 'Forensic Timeline',
    desc: 'Paste multi-turn conversations to reconstruct attack kill chains. Detects crescendo attacks, frog boiling, and context smuggling patterns.',
    link: '/timeline',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
  },
  {
    title: 'Attack Complexity Score',
    desc: '4-axis radar profiling: Sophistication, Blast Radius, Stealth, Irreversibility. Quantifies threats from trivial to expert-level.',
    link: '/scanner',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    ),
  },
  {
    title: 'Prompt Vaccine Generator',
    desc: 'Detected attacks automatically produce defensive system prompt clauses. Copy-paste hardening for your AI applications.',
    link: '/scanner',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
    ),
  },
  {
    title: 'EU AI Act Compliance',
    desc: 'Generate article-by-article compliance reports mapped to EU AI Act, OWASP LLM Top 10, and MITRE ATLAS. Export audit-ready documentation.',
    link: '/compliance',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    ),
  },
];

const CHANNELS = [
  { name: 'npm', desc: '@forensicate/scanner', cmd: 'npm install @forensicate/scanner', color: 'text-red-400' },
  { name: 'PyPI', desc: 'forensicate', cmd: 'pip install forensicate', color: 'text-blue-400' },
  { name: 'CLI', desc: 'npx forensicate', cmd: 'echo "test" | npx forensicate', color: 'text-green-400' },
  { name: 'GitHub Action', desc: 'CI/CD scanning', cmd: 'uses: peterhanily/forensicate.ai@main', color: 'text-purple-400' },
  { name: 'Chrome', desc: 'Right-click scanning', cmd: 'Chrome Web Store', color: 'text-yellow-400' },
  { name: 'VS Code', desc: 'Inline diagnostics', cmd: 'forensicate-vscode', color: 'text-cyan-400' },
  { name: 'REST API', desc: 'api.forensicate.ai', cmd: 'POST /v1/scan', color: 'text-orange-400' },
];

const FRAMEWORKS = [
  { name: 'OWASP LLM Top 10', tag: 'LLM01-LLM10' },
  { name: 'OWASP Agentic AI', tag: 'ASI01-ASI10' },
  { name: 'MITRE ATLAS', tag: 'AML.T0051+' },
  { name: 'EU AI Act', tag: 'Risk levels' },
  { name: 'Kill Chain', tag: '7 stages' },
  { name: 'SARIF 2.1', tag: 'Export' },
];

export default function Landing() {
  return (
    <div className="space-y-16 pb-12">
      {/* Hero */}
      <section className="text-center pt-8 md:pt-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c9a227]/10 border border-[#c9a227]/30 text-[#c9a227] text-xs mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          168 detection rules across 20 categories
        </div>

        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight" style={{ fontFamily: 'serif' }}>
          AI Prompt Security<br />
          <span className="text-[#c9a227]">Scanner & Forensics Platform</span>
        </h2>

        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-8">
          Detect prompt injection, jailbreaks, and hidden payloads.
          Zero dependencies. Works offline. Runs everywhere.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/scanner"
            className="px-6 py-3 bg-gradient-to-r from-[#c9a227] to-[#d4b030] text-gray-900 font-bold rounded-lg shadow-lg hover:shadow-[0_0_20px_rgba(201,162,39,0.4)] transition-all hover:scale-105 text-sm"
          >
            Launch Scanner
          </Link>
          <a
            href="https://github.com/peterhanily/forensicate.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-gray-800 text-gray-300 font-semibold rounded-lg border border-gray-700 hover:bg-gray-700 hover:text-white transition-all text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
            View on GitHub
          </a>
        </div>

        {/* Quick install */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <code className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 font-mono">
              npm install @forensicate/scanner
            </code>
            <code className="px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 font-mono">
              pip install forensicate
            </code>
          </div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">npm &amp; PyPI packages coming soon</span>
        </div>
      </section>

      {/* Stats bar */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {[
          { value: '160', label: 'Detection Rules' },
          { value: '7', label: 'Distribution Channels' },
          { value: '20', label: 'Attack Categories' },
          { value: '921', label: 'Tests Passing' },
        ].map(stat => (
          <div key={stat.label} className="text-center p-4 rounded-lg bg-gray-900/50 border border-gray-800">
            <div className="text-2xl md:text-3xl font-bold text-[#c9a227] font-mono">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section>
        <h3 className="text-xl font-bold text-white text-center mb-8" style={{ fontFamily: 'serif' }}>
          Detection, Forensics & Defense
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {FEATURES.map(f => (
            <Link
              key={f.title}
              to={f.link}
              className="p-5 rounded-lg bg-gray-900/50 border border-gray-800 hover:border-[#c9a227]/40 transition-all group"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[#c9a227] group-hover:scale-110 transition-transform">{f.icon}</span>
                <h4 className="font-semibold text-gray-200 text-sm">{f.title}</h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Distribution */}
      <section className="max-w-4xl mx-auto">
        <h3 className="text-xl font-bold text-white text-center mb-2" style={{ fontFamily: 'serif' }}>
          Runs Everywhere
        </h3>
        <p className="text-gray-500 text-sm text-center mb-6">
          One detection engine, seven distribution channels. No vendor lock-in.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {CHANNELS.map(ch => (
            <div key={ch.name} className="p-3 rounded-lg bg-gray-900/50 border border-gray-800 text-center">
              <div className={`text-sm font-bold ${ch.color}`}>{ch.name}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{ch.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance */}
      <section className="max-w-4xl mx-auto">
        <h3 className="text-xl font-bold text-white text-center mb-6" style={{ fontFamily: 'serif' }}>
          Compliance Framework Mapping
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {FRAMEWORKS.map(fw => (
            <div key={fw.name} className="px-4 py-2 rounded-lg bg-gray-900/50 border border-gray-800 flex items-center gap-2">
              <span className="text-xs text-gray-300 font-medium">{fw.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded font-mono">{fw.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Code example */}
      <section className="max-w-3xl mx-auto">
        <h3 className="text-xl font-bold text-white text-center mb-6" style={{ fontFamily: 'serif' }}>
          Simple to Integrate
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1 font-mono">JavaScript / TypeScript</div>
            <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto">
{`import { scanPrompt } from '@forensicate/scanner';

const result = scanPrompt(userInput);

if (result.isPositive) {
  console.log(\`Injection detected: \${result.confidence}%\`);
  console.log(result.matchedRules.map(r => r.ruleName));
}`}
            </pre>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1 font-mono">Python</div>
            <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto">
{`from forensicate import scan_prompt

result = scan_prompt(user_input)

if result.is_positive:
    print(f"Injection detected: {result.confidence}%")
    for rule in result.matched_rules:
        print(f"  {rule.rule_name}")`}
            </pre>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1 font-mono">GitHub Action</div>
          <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto">
{`- name: Scan for prompt injection
  uses: peterhanily/forensicate.ai/packages/github-action@main
  with:
    confidence-threshold: 50
    comment-on-pr: true
    sarif-upload: true`}
          </pre>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center max-w-2xl mx-auto">
        <h3 className="text-xl font-bold text-white mb-3" style={{ fontFamily: 'serif' }}>
          Open Source. Privacy-First. Independent.
        </h3>
        <p className="text-gray-500 text-sm mb-6">
          Apache 2.0 licensed. Not owned by any LLM provider.
          Every scan runs client-side with zero external calls.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/scanner"
            className="px-6 py-3 bg-gradient-to-r from-[#8b0000] to-[#5c0000] text-[#c9a227] font-bold rounded-lg shadow-lg hover:shadow-[0_0_15px_rgba(139,0,0,0.5)] transition-all text-sm"
          >
            Try the Scanner
          </Link>
          <Link
            to="/mutate"
            className="px-6 py-3 bg-gray-800 text-gray-300 font-semibold rounded-lg border border-gray-700 hover:bg-gray-700 transition-all text-sm"
          >
            Test Your Defenses
          </Link>
        </div>
      </section>
    </div>
  );
}
