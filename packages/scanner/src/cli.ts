#!/usr/bin/env node

// Forensicate.ai CLI
// Usage:
//   forensicate [file...]           Scan files for prompt injection
//   forensicate --stdin             Read from stdin
//   forensicate --config file.yaml  Use custom config
//   cat prompt.txt | forensicate    Pipe input

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, extname, join, basename } from 'node:path';
import { scanPrompt } from './scanner.js';
import { getEnabledRules, ruleCategories } from './rules.js';
import { computeAttackComplexity, getComplexityDescription } from './attackComplexity.js';
import { parseConfigYaml, applyConfigToRules } from './config.js';
import type { ForensicateConfig } from './config.js';
import type { DetectionRule, ScanResult } from './types.js';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
interface CliArgs {
  files: string[];
  stdin: boolean;
  config: string | null;
  threshold: number;
  output: 'text' | 'json' | 'sarif';
  quiet: boolean;
  version: boolean;
  help: boolean;
  minSeverity: string | null;
  categories: string[];
  disableRules: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    files: [],
    stdin: false,
    config: null,
    threshold: -1, // -1 means "not set, use config or default"
    output: 'text',
    quiet: false,
    version: false,
    help: false,
    minSeverity: null,
    categories: [],
    disableRules: [],
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--stdin':
      case '-':
        args.stdin = true;
        break;
      case '--config':
      case '-c':
        args.config = argv[++i] || null;
        break;
      case '--threshold':
      case '-t':
        args.threshold = parseInt(argv[++i] || '0', 10);
        break;
      case '--json':
      case '-j':
        args.output = 'json';
        break;
      case '--sarif':
        args.output = 'sarif';
        break;
      case '--quiet':
      case '-q':
        args.quiet = true;
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--min-severity':
        args.minSeverity = argv[++i] || null;
        break;
      case '--categories':
        args.categories = (argv[++i] || '').split(',').filter(s => s);
        break;
      case '--disable-rules':
        args.disableRules = (argv[++i] || '').split(',').filter(s => s);
        break;
      default:
        if (!arg.startsWith('-')) {
          args.files.push(arg);
        }
        break;
    }
    i++;
  }

  return args;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------
function findConfig(explicitPath: string | null): ForensicateConfig | null {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      console.error(`Error: Config file not found: ${explicitPath}`);
      process.exit(2);
    }
    const content = readFileSync(explicitPath, 'utf-8');
    return parseConfigYaml(content);
  }

  // Auto-discover config files
  const candidates = ['forensicate.yaml', 'forensicate.yml', '.forensicaterc.yaml', '.forensicaterc.yml'];
  for (const name of candidates) {
    const path = resolve(name);
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      return parseConfigYaml(content);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------
const DEFAULT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.csv', '.prompt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp',
  '.h', '.cs', '.php', '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.toml', '.ini', '.cfg', '.conf', '.env', '.cursorrules',
  '.svelte', '.vue', '.astro', '.mdx',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);

function listFilesRecursive(dir: string, extensions: Set<string>, maxSize: number): string[] {
  const results: string[] = [];

  function walk(d: string) {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(d, entry);
      try {
        const stats = statSync(full);
        if (stats.isDirectory()) {
          walk(full);
        } else if (stats.isFile() && stats.size <= maxSize && extensions.has(extname(entry).toLowerCase())) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  }

  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------
function formatText(file: string | null, result: ScanResult, config: ForensicateConfig): string {
  const lines: string[] = [];

  if (file) {
    lines.push(`\x1b[1m${file}\x1b[0m`);
  }

  if (!result.isPositive && result.matchedRules.length === 0) {
    lines.push('  \x1b[32m✓ No injection patterns detected\x1b[0m');
    return lines.join('\n');
  }

  const statusColor = result.isPositive ? '\x1b[31m' : '\x1b[33m';
  const statusLabel = result.isPositive ? 'INJECTION DETECTED' : 'BELOW THRESHOLD';
  lines.push(`  ${statusColor}${statusLabel}\x1b[0m  Confidence: ${result.confidence}%  Rules: ${result.matchedRules.length}`);

  // ACS
  const acs = computeAttackComplexity(result.matchedRules, result.compoundThreats);
  if (acs) {
    lines.push(`  Attack Complexity: ${acs.overall}/100 [${acs.label.toUpperCase()}]  SOPH:${acs.sophistication} BLAST:${acs.blastRadius} STLTH:${acs.stealth} IRREV:${acs.reversibility}`);
  }

  lines.push('');

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...result.matchedRules].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  for (const rule of sorted) {
    const sevColor = rule.severity === 'critical' ? '\x1b[31m' : rule.severity === 'high' ? '\x1b[33m' : rule.severity === 'medium' ? '\x1b[93m' : '\x1b[32m';
    const impact = rule.confidenceImpact != null ? ` (+${rule.confidenceImpact}pts)` : '';

    let detail = '';
    if (rule.details) {
      detail = rule.details;
    } else if (rule.matches.length > 0) {
      detail = rule.matches.slice(0, 3).map(m => `"${m.slice(0, 50)}"`).join(', ');
    }

    lines.push(`  ${sevColor}[${rule.severity.toUpperCase()}]\x1b[0m ${rule.ruleName}${impact}`);
    if (detail) {
      lines.push(`         ${detail}`);
    }

    // Framework badges
    const frameworks: string[] = [];
    if (rule.killChain?.length) frameworks.push(...rule.killChain.map(s => `kc:${s}`));
    if (rule.mitreAtlas?.length) frameworks.push(...rule.mitreAtlas);
    if (rule.euAiActRisk) frameworks.push(`EU:${rule.euAiActRisk}`);
    if (frameworks.length) {
      lines.push(`         \x1b[90m${frameworks.join('  ')}\x1b[0m`);
    }
  }

  // Compound threats
  if (result.compoundThreats?.length) {
    lines.push('');
    lines.push('  \x1b[31mCompound Threats:\x1b[0m');
    for (const t of result.compoundThreats) {
      lines.push(`    ⚠ ${t.name} [${t.severity}]: ${t.description}`);
    }
  }

  return lines.join('\n');
}

function formatJson(file: string | null, result: ScanResult): object {
  const acs = computeAttackComplexity(result.matchedRules, result.compoundThreats);
  return {
    file,
    isPositive: result.isPositive,
    confidence: result.confidence,
    rulesChecked: result.totalRulesChecked,
    ...(acs && { attackComplexity: acs }),
    matchedRules: result.matchedRules.map(r => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName,
      severity: r.severity,
      ruleType: r.ruleType,
      confidenceImpact: r.confidenceImpact,
      matches: r.matches.slice(0, 5),
      killChain: r.killChain,
      mitreAtlas: r.mitreAtlas,
      euAiActRisk: r.euAiActRisk,
    })),
    compoundThreats: result.compoundThreats ?? [],
  };
}

function formatSarif(findings: Array<{ file: string | null; result: ScanResult }>): object {
  const rules: Array<Record<string, unknown>> = [];
  const results: Array<Record<string, unknown>> = [];
  const seenRules = new Set<string>();

  for (const { file, result } of findings) {
    for (const match of result.matchedRules) {
      if (!seenRules.has(match.ruleId)) {
        seenRules.add(match.ruleId);
        rules.push({
          id: match.ruleId,
          name: match.ruleName,
          shortDescription: { text: match.ruleName },
          defaultConfiguration: { level: match.severity === 'critical' || match.severity === 'high' ? 'error' : match.severity === 'medium' ? 'warning' : 'note' },
          properties: {
            severity: match.severity,
            'security-severity': match.severity === 'critical' ? '9.0' : match.severity === 'high' ? '7.0' : match.severity === 'medium' ? '5.0' : '3.0',
            ...(match.killChain && { killChainStages: match.killChain }),
            ...(match.mitreAtlas && { mitreAtlasTechniques: match.mitreAtlas }),
          },
        });
      }

      const locations = (match.matchPositions || []).slice(0, 5).map(pos => ({
        physicalLocation: {
          artifactLocation: { uri: file ?? 'stdin' },
          region: { startLine: pos.line, startColumn: pos.column, snippet: { text: pos.text.slice(0, 200) } },
        },
      }));
      if (locations.length === 0) {
        locations.push({ physicalLocation: { artifactLocation: { uri: file ?? 'stdin' }, region: { startLine: 1, startColumn: 1, snippet: { text: '' } } } });
      }

      results.push({
        ruleId: match.ruleId,
        level: match.severity === 'critical' || match.severity === 'high' ? 'error' : match.severity === 'medium' ? 'warning' : 'note',
        message: { text: `${match.ruleName}: ${match.details || match.matches.slice(0, 3).join(', ') || 'Pattern matched'}` },
        locations,
      });
    }
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'Forensicate.ai', version: '1.0.0', rules } }, results }],
  };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------
const HELP = `
\x1b[1mForensicate.ai\x1b[0m — AI Prompt Injection Scanner

\x1b[1mUSAGE\x1b[0m
  forensicate [options] [file...]
  cat prompt.txt | forensicate --stdin

\x1b[1mOPTIONS\x1b[0m
  -h, --help              Show this help
  -v, --version           Show version
  -t, --threshold <n>     Confidence threshold (0-99, default: 0)
  -j, --json              JSON output
      --sarif             SARIF output
  -q, --quiet             Exit code only (0=clean, 1=found)
  -c, --config <file>     Config file (default: auto-discover forensicate.yaml)
      --stdin             Read from stdin
      --min-severity <s>  Minimum rule severity (low|medium|high|critical)
      --categories <ids>  Comma-separated category IDs to enable
      --disable-rules <ids>  Comma-separated rule IDs to disable

\x1b[1mCONFIG FILE\x1b[0m (forensicate.yaml)
  threshold: 50
  min-severity: medium
  output: json
  categories:
    - jailbreak
    - instruction-override
  disable-rules:
    - kw-fiction-framing
  paths:
    - "**/*.md"
    - "**/*.prompt"

\x1b[1mEXAMPLES\x1b[0m
  forensicate prompt.txt                Scan a file
  forensicate src/**/*.md               Scan with glob
  echo "ignore all" | forensicate -     Scan from stdin
  forensicate -t 50 -j src/            Scan directory, JSON output, threshold 50
`.trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.version) {
    console.log('forensicate 1.0.0');
    process.exit(0);
  }

  // Load config
  const fileConfig = findConfig(args.config);
  const config: ForensicateConfig = {
    ...fileConfig,
    // CLI args override config file
    ...(args.threshold >= 0 && { threshold: args.threshold }),
    ...(args.output !== 'text' && { output: args.output }),
    ...(args.minSeverity && { minSeverity: args.minSeverity as ForensicateConfig['minSeverity'] }),
    ...(args.categories.length && { categories: args.categories }),
    ...(args.disableRules.length && { disableRules: args.disableRules }),
  };

  const threshold = config.threshold ?? 0;
  const extensions = config.extensions
    ? new Set(config.extensions.map(e => e.startsWith('.') ? e : `.${e}`))
    : DEFAULT_EXTENSIONS;
  const maxFileSize = (config.maxFileSizeKb ?? 512) * 1024;

  // Build filtered rule set
  const { enabledRuleIds } = applyConfigToRules(config, ruleCategories);
  const allRules = getEnabledRules();
  const filteredRules: DetectionRule[] = allRules.filter(r => enabledRuleIds.has(r.id));

  // Determine inputs
  let inputs: Array<{ file: string | null; content: string }> = [];

  if (args.stdin || (args.files.length === 0 && !process.stdin.isTTY)) {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    inputs.push({ file: null, content });
  } else if (args.files.length > 0) {
    for (const fileArg of args.files) {
      const absPath = resolve(fileArg);
      if (!existsSync(absPath)) {
        if (!args.quiet) console.error(`Warning: File not found: ${fileArg}`);
        continue;
      }

      const stats = statSync(absPath);
      if (stats.isDirectory()) {
        const files = listFilesRecursive(absPath, extensions, maxFileSize);
        for (const f of files) {
          try {
            const content = readFileSync(f, 'utf-8');
            if (content.trim()) inputs.push({ file: f, content });
          } catch { /* skip */ }
        }
      } else if (stats.isFile()) {
        try {
          const content = readFileSync(absPath, 'utf-8');
          if (content.trim()) inputs.push({ file: absPath, content });
        } catch {
          if (!args.quiet) console.error(`Warning: Cannot read: ${fileArg}`);
        }
      }
    }
  } else {
    console.log(HELP);
    process.exit(0);
  }

  if (inputs.length === 0) {
    if (!args.quiet) console.error('No input to scan.');
    process.exit(0);
  }

  // Scan all inputs once, store results
  const allResults: Array<{ file: string | null; result: ScanResult }> = [];
  const findings: Array<{ file: string | null; result: ScanResult }> = [];
  let hasPositive = false;

  for (const { file, content } of inputs) {
    const result = scanPrompt(content, filteredRules, threshold);
    allResults.push({ file, result });
    if (result.isPositive) {
      hasPositive = true;
      findings.push({ file, result });
    } else if (result.matchedRules.length > 0) {
      findings.push({ file, result });
    }
  }

  // Output
  if (args.quiet) {
    process.exit(hasPositive ? 1 : 0);
  }

  const outputFormat = config.output ?? 'text';

  if (outputFormat === 'json') {
    if (allResults.length === 1) {
      console.log(JSON.stringify(formatJson(allResults[0].file, allResults[0].result), null, 2));
    } else {
      console.log(JSON.stringify(allResults.map(r => formatJson(r.file, r.result)), null, 2));
    }
  } else if (outputFormat === 'sarif') {
    const sarifFindings = allResults.filter(f => f.result.matchedRules.length > 0);
    console.log(JSON.stringify(formatSarif(sarifFindings), null, 2));
  } else {
    // Text output
    if (findings.length === 0 && inputs.length > 0) {
      console.log(`\x1b[32m✓ No injection patterns detected\x1b[0m (${inputs.length} file${inputs.length !== 1 ? 's' : ''} scanned, ${filteredRules.length} rules)`);
    } else {
      for (const { file, result } of findings) {
        console.log(formatText(file, result, config));
        console.log('');
      }

      // Summary
      console.log(`\x1b[1m${findings.length} finding${findings.length !== 1 ? 's' : ''}\x1b[0m in ${inputs.length} file${inputs.length !== 1 ? 's' : ''} (${filteredRules.length} rules)`);
    }
  }

  process.exit(hasPositive ? 1 : 0);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(2);
});
