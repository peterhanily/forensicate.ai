#!/usr/bin/env node

// Forensicate.ai GitHub Action — Scan Script
// Scans changed files (or glob-matched files) for prompt injection patterns
// and reports findings as GitHub Actions annotations, step summary, PR comment,
// and SARIF report.

import { readFileSync, readdirSync, existsSync, appendFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Import scanner from the locally-installed @forensicate/scanner package
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const scannerPath = join(__dirname, 'node_modules', '@forensicate', 'scanner', 'dist', 'index.js');
const { scanPrompt, computeAttackComplexity, parseConfigYaml, applyConfigToRules, ruleCategories, getEnabledRules } = await import(scannerPath);

// ---------------------------------------------------------------------------
// Configuration from environment (set by action.yml) + config file
// ---------------------------------------------------------------------------

// Load forensicate.yaml if present (config file settings are defaults, action inputs override)
let fileConfig = {};
for (const name of ['forensicate.yaml', 'forensicate.yml', '.forensicaterc.yaml', '.forensicaterc.yml']) {
  const configPath = resolve(name);
  if (existsSync(configPath)) {
    try {
      fileConfig = parseConfigYaml(readFileSync(configPath, 'utf-8'));
      console.log(`  Loaded config: ${name}`);
    } catch (err) {
      console.log(`::warning::Failed to parse ${name}: ${err.message}`);
    }
    break;
  }
}

const PATHS = (process.env.INPUT_PATHS || '').trim() || (fileConfig.paths || []).join(' ');
const CONFIDENCE_THRESHOLD = parseInt(process.env.INPUT_CONFIDENCE_THRESHOLD || '50', 10);
const FAIL_ON_FINDING = process.env.INPUT_FAIL_ON_FINDING != null
  ? process.env.INPUT_FAIL_ON_FINDING.toLowerCase() === 'true'
  : fileConfig.failOnFinding ?? true;
const SCAN_MODE = process.env.INPUT_SCAN_MODE || fileConfig.scanMode || 'changed';
const COMMENT_ON_PR = (process.env.INPUT_COMMENT_ON_PR || 'true').toLowerCase() === 'true';
const SARIF_UPLOAD = (process.env.INPUT_SARIF_UPLOAD || fileConfig.output === 'sarif' ? 'true' : 'false').toLowerCase() === 'true';
const GITHUB_TOKEN = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';

// Build filtered rule set from config
let configuredRules = null;
if (fileConfig.categories || fileConfig.disableCategories || fileConfig.disableRules || fileConfig.minSeverity) {
  const { enabledRuleIds } = applyConfigToRules(fileConfig, ruleCategories);
  const allRules = getEnabledRules();
  configuredRules = allRules.filter(r => enabledRuleIds.has(r.id));
  console.log(`  Config filtered rules: ${configuredRules.length}/${allRules.length}`);
}

// Extensions considered scannable (text-like files)
const SCANNABLE_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.csv', '.prompt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp',
  '.h', '.cs', '.php', '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.toml', '.ini', '.cfg', '.conf', '.env', '.cursorrules',
  '.svelte', '.vue', '.astro', '.mdx',
]);

// Maximum file size to scan (512 KB)
const MAX_FILE_SIZE = 512 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a file path should be scanned based on extension and location.
 */
function isScannable(filePath) {
  // Skip common non-text directories
  const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv'];
  for (const dir of skipDirs) {
    if (filePath.includes(`/${dir}/`) || filePath.startsWith(`${dir}/`)) {
      return false;
    }
  }

  const ext = extname(filePath).toLowerCase();
  if (!SCANNABLE_EXTENSIONS.has(ext)) {
    return false;
  }

  return true;
}

/**
 * Read a file safely, returning null if it cannot be read or is too large.
 */
function readFileSafe(filePath) {
  try {
    const absPath = resolve(filePath);
    if (!existsSync(absPath)) return null;

    const stats = statSync(absPath);
    if (stats.size > MAX_FILE_SIZE) return null;
    if (!stats.isFile()) return null;

    return readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get the list of changed files from a pull request event.
 * Uses git diff against the PR base ref.
 */
function getChangedFiles() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) {
    console.log('::warning::No GITHUB_EVENT_PATH found. Falling back to all-files mode.');
    return null;
  }

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf-8'));
    const baseSha = event?.pull_request?.base?.sha;

    if (!baseSha) {
      console.log('::warning::Not a pull_request event or missing base SHA. Falling back to all-files mode.');
      return null;
    }

    // Validate SHA to prevent command injection
    if (!/^[0-9a-f]{40}$/i.test(baseSha)) {
      console.log('::warning::Invalid base SHA format. Falling back to all-files mode.');
      return null;
    }

    const output = execSync(`git diff --name-only --diff-filter=ACMR ${baseSha}...HEAD`, {
      encoding: 'utf-8',
      timeout: 30_000,
    });

    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  } catch (err) {
    console.log(`::warning::Failed to get changed files via git diff: ${err.message}`);
    return null;
  }
}

/**
 * Match files against a simple glob pattern.
 * Supports: *, **, and ? wildcards.
 */
function matchGlob(filePath, pattern) {
  // Convert glob to regex
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars (except * and ?)
    .replace(/\*\*/g, '{{GLOBSTAR}}')        // Placeholder for **
    .replace(/\*/g, '[^/]*')                 // * matches anything except /
    .replace(/\?/g, '[^/]')                  // ? matches single char except /
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');     // ** matches everything including /

  regex = `^${regex}$`;
  return new RegExp(regex).test(filePath);
}

/**
 * Recursively list files in a directory.
 */
function listFiles(dir, base = '') {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = base ? join(base, entry) : entry;
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv'].includes(entry)) {
          continue;
        }
        results.push(...listFiles(fullPath, relPath));
      } else if (stats.isFile()) {
        results.push(relPath);
      }
    } catch {
      // Skip files we can't stat
    }
  }
  return results;
}

/**
 * Get files to scan based on configured paths and scan mode.
 */
function getFilesToScan() {
  // If explicit paths/globs are provided, use them
  if (PATHS) {
    const patterns = PATHS.split(/\s+/).filter(p => p.length > 0);
    const cwd = process.cwd();
    const allFiles = listFiles(cwd);
    const matched = new Set();

    for (const pattern of patterns) {
      for (const file of allFiles) {
        if (matchGlob(file, pattern)) {
          matched.add(file);
        }
      }
    }

    return [...matched];
  }

  // "changed" mode: get files from PR diff
  if (SCAN_MODE === 'changed') {
    const changed = getChangedFiles();
    if (changed !== null) {
      return changed;
    }
    // Fall through to all-files mode if we couldn't get changed files
  }

  // "all" mode or fallback: list all files in the repo
  return listFiles(process.cwd());
}

/**
 * Map severity to GitHub annotation level.
 */
function severityToAnnotationLevel(severity) {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'notice';
  }
}

/**
 * Escape a string for use in GitHub Actions output.
 */
function escapeAnnotation(str) {
  return str.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Map severity to SARIF level.
 */
function sarifLevel(severity) {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'note';
  }
}

/**
 * Severity badge emoji for markdown.
 */
function severityBadge(severity) {
  switch (severity) {
    case 'critical': return '🔴 CRITICAL';
    case 'high': return '🟠 HIGH';
    case 'medium': return '🟡 MEDIUM';
    case 'low': return '🟢 LOW';
    default: return severity;
  }
}

/**
 * Get PR context from the event payload.
 */
function getPrContext() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return null;

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf-8'));
    if (!event?.pull_request?.number) return null;

    const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
    return {
      number: event.pull_request.number,
      owner: repo?.split('/')[0],
      repo: repo?.split('/')[1],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SARIF Report Generation
// ---------------------------------------------------------------------------

function generateSARIF(findings, filesScanned) {
  const rules = [];
  const results = [];
  const seenRules = new Set();

  for (const { file, result } of findings) {
    for (const match of result.matchedRules) {
      // Add rule definition if not already seen
      if (!seenRules.has(match.ruleId)) {
        seenRules.add(match.ruleId);
        rules.push({
          id: match.ruleId,
          name: match.ruleName,
          shortDescription: { text: match.ruleName },
          defaultConfiguration: { level: sarifLevel(match.severity) },
          properties: {
            severity: match.severity,
            ruleType: match.ruleType,
            'security-severity': match.severity === 'critical' ? '9.0' : match.severity === 'high' ? '7.0' : match.severity === 'medium' ? '5.0' : '3.0',
            ...(match.killChain && { killChainStages: match.killChain }),
            ...(match.mitreAtlas && { mitreAtlasTechniques: match.mitreAtlas }),
            ...(match.euAiActRisk && { euAiActRiskLevel: match.euAiActRisk }),
            tags: [
              `severity:${match.severity}`,
              ...(match.killChain?.map(s => `kill-chain:${s}`) || []),
              ...(match.mitreAtlas?.map(id => `mitre:${id}`) || []),
              ...(match.euAiActRisk ? [`eu-ai-act:${match.euAiActRisk}`] : []),
            ],
          },
        });
      }

      // Add result
      const locations = (match.matchPositions || match.positions || []).slice(0, 5).map(pos => ({
        physicalLocation: {
          artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' },
          region: {
            startLine: pos.line || 1,
            startColumn: pos.column || 1,
            snippet: { text: (pos.text || '').slice(0, 200) },
          },
        },
      }));

      if (locations.length === 0) {
        locations.push({
          physicalLocation: {
            artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' },
            region: { startLine: 1 },
          },
        });
      }

      results.push({
        ruleId: match.ruleId,
        level: sarifLevel(match.severity),
        message: {
          text: match.details
            ? `${match.ruleName} (${match.severity}): ${match.details}`
            : `${match.ruleName} (${match.severity}): ${(match.matches || []).slice(0, 3).map(m => m.slice(0, 80)).join(', ') || 'Pattern matched'}`,
        },
        locations,
        properties: {
          confidenceImpact: match.confidenceImpact,
          ...(match.killChain && { killChain: match.killChain }),
          ...(match.mitreAtlas && { mitreAtlas: match.mitreAtlas }),
        },
      });
    }
  }

  // Compute overall ACS for invocation properties
  const allMatchedRules = findings.flatMap(f => f.result.matchedRules);
  const allCompoundThreats = findings.flatMap(f => f.result.compoundThreats || []);
  const acs = computeAttackComplexity(allMatchedRules, allCompoundThreats);

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'Forensicate.ai',
          version: '1.0.0',
          informationUri: 'https://github.com/peterhanily/forensicate.ai',
          rules,
        },
      },
      results,
      invocations: [{
        executionSuccessful: true,
        startTimeUtc: new Date().toISOString(),
        properties: {
          filesScanned,
          findingsCount: findings.length,
          confidenceThreshold: CONFIDENCE_THRESHOLD,
          ...(acs && { attackComplexity: acs }),
        },
      }],
    }],
  };
}

// ---------------------------------------------------------------------------
// PR Comment Generation
// ---------------------------------------------------------------------------

function generatePrComment(findings, filesScanned, maxConfidence) {
  const lines = [];

  lines.push('## 🛡️ Forensicate.ai Scan Results');
  lines.push('');

  if (findings.length === 0) {
    lines.push('✅ **No prompt injection patterns detected** above the confidence threshold.');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | --- |`);
    lines.push(`| Files scanned | ${filesScanned} |`);
    lines.push(`| Confidence threshold | ${CONFIDENCE_THRESHOLD}% |`);
    lines.push('');
    lines.push('---');
    lines.push('*Scanned by [Forensicate.ai](https://github.com/peterhanily/forensicate.ai) · 176 detection rules*');
    return lines.join('\n');
  }

  // --- Metrics summary ---
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Files scanned | ${filesScanned} |`);
  lines.push(`| ⚠️ Files with findings | **${findings.length}** |`);
  lines.push(`| Confidence threshold | ${CONFIDENCE_THRESHOLD}% |`);
  lines.push(`| Highest confidence | **${maxConfidence}%** |`);
  lines.push('');

  // --- ACS summary ---
  const allMatchedRules = findings.flatMap(f => f.result.matchedRules);
  const allCompoundThreats = findings.flatMap(f => f.result.compoundThreats || []);
  const acs = computeAttackComplexity(allMatchedRules, allCompoundThreats);

  if (acs) {
    const labelEmoji = {
      trivial: '🟢', basic: '🔵', intermediate: '🟡', advanced: '🟠', expert: '🔴',
    };
    lines.push('### Attack Complexity Score');
    lines.push('');
    lines.push(`| Axis | Score | | Overall |`);
    lines.push(`| --- | ---: | --- | --- |`);
    lines.push(`| Sophistication | ${acs.sophistication}/100 | ${progressBar(acs.sophistication)} | ${labelEmoji[acs.label] || ''} **${acs.overall}/100** |`);
    lines.push(`| Blast Radius | ${acs.blastRadius}/100 | ${progressBar(acs.blastRadius)} | \`${acs.label.toUpperCase()}\` |`);
    lines.push(`| Stealth | ${acs.stealth}/100 | ${progressBar(acs.stealth)} | |`);
    lines.push(`| Irreversibility | ${acs.reversibility}/100 | ${progressBar(acs.reversibility)} | |`);
    lines.push('');
  }

  // --- Findings table ---
  lines.push('### Findings');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Click to expand detailed findings</summary>');
  lines.push('');

  for (const { file, result } of findings) {
    const maxSeverity = result.matchedRules.reduce((max, r) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1 };
      return (order[r.severity] || 0) > (order[max] || 0) ? r.severity : max;
    }, 'low');

    lines.push(`#### \`${file}\` — ${severityBadge(maxSeverity)} (${result.confidence}%)`);
    lines.push('');
    lines.push('| Rule | Severity | Impact | Frameworks |');
    lines.push('| --- | --- | ---: | --- |');

    for (const rule of result.matchedRules) {
      const frameworks = [];
      if (rule.killChain?.length) {
        frameworks.push(...rule.killChain.map(s => `\`kc:${s}\``));
      }
      if (rule.mitreAtlas?.length) {
        frameworks.push(...rule.mitreAtlas.map(id => `\`${id}\``));
      }
      if (rule.euAiActRisk) {
        frameworks.push(`\`EU:${rule.euAiActRisk}\``);
      }

      lines.push(`| ${rule.ruleName} | \`${rule.severity.toUpperCase()}\` | +${rule.confidenceImpact || 0}pts | ${frameworks.join(' ') || '—'} |`);
    }

    // Compound threats
    if (result.compoundThreats?.length) {
      lines.push('');
      lines.push(`**Compound threats:** ${result.compoundThreats.map(t => `\`${t.name}\``).join(', ')}`);
    }

    lines.push('');
  }

  lines.push('</details>');
  lines.push('');

  // --- Compliance summary ---
  const allKillChain = [...new Set(allMatchedRules.flatMap(r => r.killChain || []))];
  const allAtlas = [...new Set(allMatchedRules.flatMap(r => r.mitreAtlas || []))];
  const allEuRisk = [...new Set(allMatchedRules.map(r => r.euAiActRisk).filter(Boolean))];

  if (allKillChain.length || allAtlas.length || allEuRisk.length) {
    lines.push('### Compliance Frameworks');
    lines.push('');
    if (allKillChain.length) {
      lines.push(`**Kill Chain Stages:** ${allKillChain.map(s => `\`${s}\``).join(' ')}`);
    }
    if (allAtlas.length) {
      lines.push(`**MITRE ATLAS:** ${allAtlas.map(id => `\`${id}\``).join(' ')}`);
    }
    if (allEuRisk.length) {
      lines.push(`**EU AI Act Risk:** ${allEuRisk.map(r => `\`${r}\``).join(' ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Scanned by [Forensicate.ai](https://github.com/peterhanily/forensicate.ai) · 176 detection rules*');

  return lines.join('\n');
}

/**
 * Generate a text progress bar for markdown.
 */
function progressBar(value) {
  const filled = Math.round(value / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/**
 * Post or update a PR comment via the GitHub API.
 */
async function postPrComment(comment) {
  const pr = getPrContext();
  if (!pr) {
    console.log('::warning::Cannot post PR comment: not a pull_request event.');
    return;
  }
  if (!GITHUB_TOKEN) {
    console.log('::warning::Cannot post PR comment: no github-token provided.');
    return;
  }

  const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
  const marker = '<!-- forensicate-ai-scan -->';
  const body = `${marker}\n${comment}`;

  try {
    // Check for existing comment to update
    const listUrl = `${apiBase}/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=100`;
    const listRes = await fetch(listUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (listRes.ok) {
      const comments = await listRes.json();
      const existing = comments.find(c => c.body?.includes(marker));

      if (existing) {
        // Update existing comment
        const updateUrl = `${apiBase}/repos/${pr.owner}/${pr.repo}/issues/comments/${existing.id}`;
        const updateRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body }),
        });

        if (updateRes.ok) {
          console.log(`  Updated existing PR comment #${existing.id}`);
        } else {
          console.log(`::warning::Failed to update PR comment: ${updateRes.status} ${updateRes.statusText}`);
        }
        return;
      }
    }

    // Create new comment
    const createUrl = `${apiBase}/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      console.log(`  Posted PR comment #${created.id}`);
    } else {
      console.log(`::warning::Failed to post PR comment: ${createRes.status} ${createRes.statusText}`);
    }
  } catch (err) {
    // Sanitize error message to prevent token leakage in logs
    const safeMsg = GITHUB_TOKEN ? err.message.replaceAll(GITHUB_TOKEN, '***') : err.message;
    console.log(`::warning::Failed to post PR comment: ${safeMsg}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Forensicate.ai Prompt Injection Scanner');
  console.log(`  Scan mode: ${SCAN_MODE}`);
  console.log(`  Confidence threshold: ${CONFIDENCE_THRESHOLD}%`);
  console.log(`  Fail on finding: ${FAIL_ON_FINDING}`);
  console.log(`  Comment on PR: ${COMMENT_ON_PR}`);
  console.log(`  SARIF upload: ${SARIF_UPLOAD}`);
  if (PATHS) {
    console.log(`  Path patterns: ${PATHS}`);
  }
  console.log('');

  const files = getFilesToScan();
  const scannableFiles = files.filter(isScannable);

  console.log(`Found ${files.length} files, ${scannableFiles.length} are scannable.`);
  console.log('');

  const findings = [];   // { file, result }
  let filesScanned = 0;
  let maxConfidence = 0;

  for (const file of scannableFiles) {
    const content = readFileSafe(file);
    if (content === null) continue;
    if (content.trim().length === 0) continue;

    filesScanned++;
    const result = scanPrompt(content, configuredRules ?? undefined, CONFIDENCE_THRESHOLD);

    if (result.isPositive && result.confidence >= CONFIDENCE_THRESHOLD) {
      findings.push({ file, result });

      if (result.confidence > maxConfidence) {
        maxConfidence = result.confidence;
      }

      // Emit GitHub Actions annotations for each matched rule
      for (const rule of result.matchedRules) {
        const level = severityToAnnotationLevel(rule.severity);
        const line = rule.matchPositions?.[0]?.line || 1;
        const title = `Prompt Injection: ${rule.ruleName}`;
        const message = rule.details
          ? `${rule.ruleName} (${rule.severity}): ${rule.details}`
          : `${rule.ruleName} (${rule.severity}): ${rule.matches.slice(0, 3).map(m => m.slice(0, 60)).join(', ')}`;

        console.log(`::${level} file=${escapeAnnotation(file)},line=${line},title=${escapeAnnotation(title)}::${escapeAnnotation(message)}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SARIF Report
  // ---------------------------------------------------------------------------
  if (SARIF_UPLOAD) {
    const sarif = generateSARIF(findings, filesScanned);
    const sarifPath = resolve('forensicate-results.sarif');
    writeFileSync(sarifPath, JSON.stringify(sarif, null, 2));
    console.log(`\n  SARIF report written to: ${sarifPath}`);

    // Set output for downstream steps
    const outputPath = process.env.GITHUB_OUTPUT;
    if (outputPath) {
      appendFileSync(outputPath, `sarif-file=${sarifPath}\n`);
    }
  }

  // ---------------------------------------------------------------------------
  // PR Comment
  // ---------------------------------------------------------------------------
  if (COMMENT_ON_PR) {
    const comment = generatePrComment(findings, filesScanned, maxConfidence);
    await postPrComment(comment);
  }

  // ---------------------------------------------------------------------------
  // Step summary
  // ---------------------------------------------------------------------------
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  const summaryLines = [];

  summaryLines.push('## Forensicate.ai Prompt Injection Scan Results');
  summaryLines.push('');
  summaryLines.push(`| Metric | Value |`);
  summaryLines.push(`| --- | --- |`);
  summaryLines.push(`| Files scanned | ${filesScanned} |`);
  summaryLines.push(`| Files with findings | ${findings.length} |`);
  summaryLines.push(`| Confidence threshold | ${CONFIDENCE_THRESHOLD}% |`);
  summaryLines.push(`| Highest confidence | ${maxConfidence}% |`);
  summaryLines.push('');

  if (findings.length > 0) {
    // ACS in step summary
    const allMatchedRules = findings.flatMap(f => f.result.matchedRules);
    const allCompoundThreats = findings.flatMap(f => f.result.compoundThreats || []);
    const acs = computeAttackComplexity(allMatchedRules, allCompoundThreats);

    if (acs) {
      summaryLines.push(`**Attack Complexity:** ${acs.overall}/100 (\`${acs.label.toUpperCase()}\`) — Sophistication: ${acs.sophistication} · Blast Radius: ${acs.blastRadius} · Stealth: ${acs.stealth} · Irreversibility: ${acs.reversibility}`);
      summaryLines.push('');
    }

    summaryLines.push('### Findings');
    summaryLines.push('');
    summaryLines.push('| File | Confidence | Severity | Rules Matched | Frameworks |');
    summaryLines.push('| --- | --- | --- | --- | --- |');

    for (const { file, result } of findings) {
      const maxSeverity = result.matchedRules.reduce((max, r) => {
        const order = { critical: 4, high: 3, medium: 2, low: 1 };
        return (order[r.severity] || 0) > (order[max] || 0) ? r.severity : max;
      }, 'low');

      const severityBadgeText =
        maxSeverity === 'critical' ? '`CRITICAL`' :
        maxSeverity === 'high' ? '`HIGH`' :
        maxSeverity === 'medium' ? '`MEDIUM`' : '`LOW`';

      const ruleNames = result.matchedRules.map(r => r.ruleName).slice(0, 5).join(', ');
      const extra = result.matchedRules.length > 5 ? ` (+${result.matchedRules.length - 5} more)` : '';

      // Collect frameworks
      const frameworks = [];
      const killChain = [...new Set(result.matchedRules.flatMap(r => r.killChain || []))];
      const atlas = [...new Set(result.matchedRules.flatMap(r => r.mitreAtlas || []))];
      if (killChain.length) frameworks.push(...killChain.slice(0, 3).map(s => `\`kc:${s}\``));
      if (atlas.length) frameworks.push(...atlas.slice(0, 3).map(id => `\`${id}\``));

      summaryLines.push(`| \`${file}\` | ${result.confidence}% | ${severityBadgeText} | ${ruleNames}${extra} | ${frameworks.join(' ') || '—'} |`);
    }

    summaryLines.push('');
  } else {
    summaryLines.push('No prompt injection patterns detected above the confidence threshold.');
    summaryLines.push('');
  }

  summaryLines.push('---');
  summaryLines.push('*Scanned by [Forensicate.ai](https://github.com/peterhanily/forensicate.ai) · 176 detection rules*');

  const summaryContent = summaryLines.join('\n');

  // Write to step summary if available, otherwise print to stdout
  if (summaryPath) {
    appendFileSync(summaryPath, summaryContent + '\n');
  } else {
    console.log('\n--- Step Summary ---');
    console.log(summaryContent);
  }

  // ---------------------------------------------------------------------------
  // Set outputs
  // ---------------------------------------------------------------------------
  const outputPath = process.env.GITHUB_OUTPUT;
  const outputs = [
    `findings-count=${findings.length}`,
    `total-files-scanned=${filesScanned}`,
    `max-confidence=${maxConfidence}`,
  ];

  if (outputPath) {
    appendFileSync(outputPath, outputs.join('\n') + '\n');
  }

  // Also log outputs for visibility
  for (const out of outputs) {
    console.log(`  Output: ${out}`);
  }

  // ---------------------------------------------------------------------------
  // Exit code
  // ---------------------------------------------------------------------------
  if (findings.length > 0) {
    console.log(`\nFound prompt injection patterns in ${findings.length} file(s).`);
    if (FAIL_ON_FINDING) {
      console.log('Exiting with failure (fail-on-finding is enabled).');
      process.exit(1);
    } else {
      console.log('Continuing (fail-on-finding is disabled).');
    }
  } else {
    console.log('\nNo prompt injection patterns detected. All clear.');
  }
}

main().catch(err => {
  console.error('::error::Forensicate.ai scan script failed:', err.message);
  console.error(err.stack);
  process.exit(2);
});
