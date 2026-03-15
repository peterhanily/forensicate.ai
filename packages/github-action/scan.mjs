#!/usr/bin/env node

// Forensicate.ai GitHub Action — Scan Script
// Scans changed files (or glob-matched files) for prompt injection patterns
// and reports findings as GitHub Actions annotations and a step summary.

import { readFileSync, readdirSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { resolve, extname, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Import scanner from the locally-installed @forensicate/scanner package
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const scannerPath = join(__dirname, 'node_modules', '@forensicate', 'scanner', 'dist', 'index.js');
const { scanPrompt, rehydrateHeuristics } = await import(scannerPath);

// Rehydrate heuristic rule functions after module load
rehydrateHeuristics();

// ---------------------------------------------------------------------------
// Configuration from environment (set by action.yml)
// ---------------------------------------------------------------------------
const PATHS = (process.env.INPUT_PATHS || '').trim();
const CONFIDENCE_THRESHOLD = parseInt(process.env.INPUT_CONFIDENCE_THRESHOLD || '50', 10);
const FAIL_ON_FINDING = (process.env.INPUT_FAIL_ON_FINDING || 'true').toLowerCase() === 'true';
const SCAN_MODE = process.env.INPUT_SCAN_MODE || 'changed';

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Forensicate.ai Prompt Injection Scanner');
  console.log(`  Scan mode: ${SCAN_MODE}`);
  console.log(`  Confidence threshold: ${CONFIDENCE_THRESHOLD}%`);
  console.log(`  Fail on finding: ${FAIL_ON_FINDING}`);
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
    const result = scanPrompt(content, undefined, CONFIDENCE_THRESHOLD);

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

        console.log(`::${level} file=${file},line=${line},title=${escapeAnnotation(title)}::${escapeAnnotation(message)}`);
      }
    }
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
    summaryLines.push('### Findings');
    summaryLines.push('');
    summaryLines.push('| File | Confidence | Severity | Rules Matched |');
    summaryLines.push('| --- | --- | --- | --- |');

    for (const { file, result } of findings) {
      const maxSeverity = result.matchedRules.reduce((max, r) => {
        const order = { critical: 4, high: 3, medium: 2, low: 1 };
        return (order[r.severity] || 0) > (order[max] || 0) ? r.severity : max;
      }, 'low');

      const severityBadge =
        maxSeverity === 'critical' ? '`CRITICAL`' :
        maxSeverity === 'high' ? '`HIGH`' :
        maxSeverity === 'medium' ? '`MEDIUM`' : '`LOW`';

      const ruleNames = result.matchedRules.map(r => r.ruleName).slice(0, 5).join(', ');
      const extra = result.matchedRules.length > 5 ? ` (+${result.matchedRules.length - 5} more)` : '';

      summaryLines.push(`| \`${file}\` | ${result.confidence}% | ${severityBadge} | ${ruleNames}${extra} |`);
    }

    summaryLines.push('');
  } else {
    summaryLines.push('No prompt injection patterns detected above the confidence threshold.');
    summaryLines.push('');
  }

  summaryLines.push('---');
  summaryLines.push('*Scanned by [Forensicate.ai](https://github.com/peterhanily/forensicate.ai)*');

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
