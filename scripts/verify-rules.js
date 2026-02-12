#!/usr/bin/env node
/**
 * Verify that rule counts are consistent across packages
 * Run this before committing changes to detection rules
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function countRulesInFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    // Count opening braces that start rules (looking for objects in arrays)
    const lines = content.split('\n');
    let inArray = false;
    let count = 0;
    let arrayName = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect start of rules array
      if (line.match(/export const (keyword|regex|heuristic|nlp)Rules.*=.*\[/)) {
        inArray = true;
        arrayName = line.match(/export const (\w+Rules)/)?.[1] || '';
        continue;
      }

      // Detect end of array
      if (inArray && line === '];') {
        inArray = false;
        continue;
      }

      // Count rule objects (lines with just "{" or "  {")
      if (inArray && line.match(/^\s*\{\s*$/)) {
        count++;
      }
    }

    return count;
  } catch (error) {
    return 0;
  }
}

function getRuleCounts() {
  const scannerSrc = join(rootDir, 'packages/scanner/src');

  return {
    keyword: countRulesInFile(join(scannerSrc, 'rules.ts')),
    regex: countRulesInFile(join(scannerSrc, 'rules.ts')) - countRulesInFile(join(scannerSrc, 'rules.ts')), // Will calculate properly
    heuristic: countRulesInFile(join(scannerSrc, 'heuristicRules.ts')),
    nlp: countRulesInFile(join(scannerSrc, 'nlpRules.ts')),
  };
}

// Better counting method - count actual rules
function getAccurateRuleCounts() {
  const scannerSrc = join(rootDir, 'packages/scanner/src');
  const rulesContent = readFileSync(join(scannerSrc, 'rules.ts'), 'utf-8');

  // Extract keyword rules section
  const keywordMatch = rulesContent.match(/export const keywordRules[^=]*=\s*\[([\s\S]*?)\n\];/);
  const keywordCount = keywordMatch ? (keywordMatch[1].match(/^\s*\{$/gm) || []).length : 0;

  // Extract regex rules section
  const regexMatch = rulesContent.match(/export const regexRules[^=]*=\s*\[([\s\S]*?)\n\];/);
  const regexCount = regexMatch ? (regexMatch[1].match(/^\s*\{$/gm) || []).length : 0;

  // Heuristic rules
  const heuristicContent = readFileSync(join(scannerSrc, 'heuristicRules.ts'), 'utf-8');
  const heuristicMatch = heuristicContent.match(/export const heuristicRules[^=]*=\s*\[([\s\S]*?)\n\];/);
  const heuristicCount = heuristicMatch ? (heuristicMatch[1].match(/^\s*\{$/gm) || []).length : 0;

  // NLP rules
  const nlpContent = readFileSync(join(scannerSrc, 'nlpRules.ts'), 'utf-8');
  const nlpMatch = nlpContent.match(/export const nlpRules[^=]*=\s*\[([\s\S]*?)\n\];/);
  const nlpCount = nlpMatch ? (nlpMatch[1].match(/^\s*\{$/gm) || []).length : 0;

  return {
    keyword: keywordCount,
    regex: regexCount,
    heuristic: heuristicCount,
    nlp: nlpCount,
    total: keywordCount + regexCount + heuristicCount + nlpCount,
  };
}

function checkTourDescription() {
  const tourStepsPath = join(rootDir, 'packages/app/src/components/tour/tourSteps.ts');
  const content = readFileSync(tourStepsPath, 'utf-8');

  // Extract rule count from tour description
  const match = content.match(/using (\d+)\+? detection rules/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

function checkMemoryFile() {
  const memoryPath = join(dirname(__dirname), '.claude/projects/-Users-rational-person-Documents-claude-code-forensicate-ai/memory/MEMORY.md');
  try {
    const content = readFileSync(memoryPath, 'utf-8');
    const match = content.match(/(\d+) detection rules \((\d+) keyword, (\d+) regex, (\d+) heuristic, (\d+) NLP\)/);
    if (match) {
      return {
        total: parseInt(match[1], 10),
        keyword: parseInt(match[2], 10),
        regex: parseInt(match[3], 10),
        heuristic: parseInt(match[4], 10),
        nlp: parseInt(match[5], 10),
      };
    }
  } catch (error) {
    // Memory file might not exist in all environments
    return null;
  }
  return null;
}

async function main() {
  log('\n📊 Forensicate.ai Rule Count Verification\n', 'cyan');
  log('═'.repeat(50), 'blue');

  // Get actual counts
  const counts = getAccurateRuleCounts();

  log('\n✅ Actual Rule Counts (from scanner source):', 'green');
  log(`   Keyword:    ${counts.keyword}`);
  log(`   Regex:      ${counts.regex}`);
  log(`   Heuristic:  ${counts.heuristic}`);
  log(`   NLP:        ${counts.nlp}`);
  log(`   ─────────────────`);
  log(`   TOTAL:      ${counts.total}`, 'cyan');

  let hasErrors = false;

  // Check tour description
  log('\n🔍 Checking tour description...', 'blue');
  const tourCount = checkTourDescription();
  if (tourCount === null) {
    log('   ⚠️  Could not find rule count in tour', 'yellow');
  } else if (tourCount === counts.total) {
    log(`   ✅ Tour mentions ${tourCount} rules (correct)`, 'green');
  } else {
    log(`   ❌ Tour mentions ${tourCount} rules but actual is ${counts.total}`, 'red');
    log(`      Update: packages/app/src/components/tour/tourSteps.ts`, 'red');
    hasErrors = true;
  }

  // Check memory file
  log('\n🔍 Checking memory file...', 'blue');
  const memCounts = checkMemoryFile();
  if (memCounts === null) {
    log('   ℹ️  Memory file not found or not parseable (OK)', 'yellow');
  } else {
    const memoryMatch =
      memCounts.total === counts.total &&
      memCounts.keyword === counts.keyword &&
      memCounts.regex === counts.regex &&
      memCounts.heuristic === counts.heuristic &&
      memCounts.nlp === counts.nlp;

    if (memoryMatch) {
      log('   ✅ Memory file counts match (correct)', 'green');
    } else {
      log('   ❌ Memory file counts mismatch:', 'red');
      log(`      Total: ${memCounts.total} (should be ${counts.total})`);
      log(`      Keyword: ${memCounts.keyword} (should be ${counts.keyword})`);
      log(`      Regex: ${memCounts.regex} (should be ${counts.regex})`);
      log(`      Heuristic: ${memCounts.heuristic} (should be ${counts.heuristic})`);
      log(`      NLP: ${memCounts.nlp} (should be ${counts.nlp})`);
      hasErrors = true;
    }
  }

  // Check extension bundle
  log('\n🔍 Checking extension bundle...', 'blue');
  try {
    const extensionBgPath = join(rootDir, 'packages/extension/dist/chrome/background.js');
    const bgContent = readFileSync(extensionBgPath, 'utf-8');

    // Check if scanner rules are bundled
    if (bgContent.includes('keywordRules') && bgContent.includes('regexRules')) {
      log('   ✅ Extension bundle includes detection rules', 'green');
      log('   ℹ️  Rebuild recommended after rule changes', 'yellow');
    } else {
      log('   ⚠️  Extension might not include all rules', 'yellow');
      log('      Run: cd packages/extension && pnpm build:chrome', 'yellow');
    }
  } catch (error) {
    log('   ℹ️  Extension not built yet', 'yellow');
    log('      Run: cd packages/extension && pnpm build:chrome', 'yellow');
  }

  log('\n' + '═'.repeat(50), 'blue');

  if (hasErrors) {
    log('\n❌ VERIFICATION FAILED', 'red');
    log('   Please update documentation to match actual rule counts\n', 'red');
    process.exit(1);
  } else {
    log('\n✅ ALL CHECKS PASSED', 'green');
    log('   Rule counts are consistent across the codebase\n', 'green');
    process.exit(0);
  }
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
