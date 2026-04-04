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

  // File rules
  let fileCount = 0;
  try {
    const fileContent = readFileSync(join(scannerSrc, 'fileRules.ts'), 'utf-8');
    const fileMatch = fileContent.match(/export const fileRules[^=]*=\s*\[([\s\S]*?)\n\];/);
    fileCount = fileMatch ? (fileMatch[1].match(/^\s*\{$/gm) || []).length : 0;
  } catch (error) {
    // fileRules.ts may not exist yet
  }

  return {
    keyword: keywordCount,
    regex: regexCount,
    heuristic: heuristicCount,
    nlp: nlpCount,
    file: fileCount,
    total: keywordCount + regexCount + heuristicCount + nlpCount + fileCount,
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
    // Support both old format (without file) and new format (with file)
    const matchNew = content.match(/(\d+) detection rules \((\d+) keyword, (\d+) regex, (\d+) heuristic, (\d+) NLP, (\d+) file\)/);
    if (matchNew) {
      return {
        total: parseInt(matchNew[1], 10),
        keyword: parseInt(matchNew[2], 10),
        regex: parseInt(matchNew[3], 10),
        heuristic: parseInt(matchNew[4], 10),
        nlp: parseInt(matchNew[5], 10),
        file: parseInt(matchNew[6], 10),
      };
    }
    const matchOld = content.match(/(\d+) detection rules \((\d+) keyword, (\d+) regex, (\d+) heuristic, (\d+) NLP\)/);
    if (matchOld) {
      return {
        total: parseInt(matchOld[1], 10),
        keyword: parseInt(matchOld[2], 10),
        regex: parseInt(matchOld[3], 10),
        heuristic: parseInt(matchOld[4], 10),
        nlp: parseInt(matchOld[5], 10),
        file: 0,
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
  log(`   File:       ${counts.file}`);
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
      memCounts.nlp === counts.nlp &&
      memCounts.file === counts.file;

    if (memoryMatch) {
      log('   ✅ Memory file counts match (correct)', 'green');
    } else {
      log('   ❌ Memory file counts mismatch:', 'red');
      log(`      Total: ${memCounts.total} (should be ${counts.total})`);
      log(`      Keyword: ${memCounts.keyword} (should be ${counts.keyword})`);
      log(`      Regex: ${memCounts.regex} (should be ${counts.regex})`);
      log(`      Heuristic: ${memCounts.heuristic} (should be ${counts.heuristic})`);
      log(`      NLP: ${memCounts.nlp} (should be ${counts.nlp})`);
      log(`      File: ${memCounts.file} (should be ${counts.file})`);
      hasErrors = true;
    }
  }

  // Check README.md rule counts
  log('\n🔍 Checking README.md...', 'blue');
  try {
    const readmeContent = readFileSync(join(rootDir, 'README.md'), 'utf-8');
    const readmeMatches = [...readmeContent.matchAll(/(\d+)\s+rules?\s+in\s+(\d+)\s+categor/gi)];
    if (readmeMatches.length === 0) {
      log('   ⚠️  Could not find rule count in README.md', 'yellow');
    } else {
      for (const match of readmeMatches) {
        const ruleCount = parseInt(match[1], 10);
        const catCount = parseInt(match[2], 10);
        if (ruleCount === counts.total) {
          log(`   ✅ README mentions ${ruleCount} rules in ${catCount} categories (correct)`, 'green');
        } else {
          log(`   ❌ README mentions ${ruleCount} rules but actual is ${counts.total}`, 'red');
          log(`      Update: README.md`, 'red');
          hasErrors = true;
        }
      }
    }
  } catch (error) {
    log('   ⚠️  Could not read README.md', 'yellow');
  }

  // Check VS Code extension package.json
  log('\n🔍 Checking VS Code extension package.json...', 'blue');
  try {
    const vscodePkgContent = readFileSync(join(rootDir, 'packages/vscode/package.json'), 'utf-8');
    const vscodeMatch = vscodePkgContent.match(/(\d+)\s+detection rules/);
    if (vscodeMatch) {
      const vscodeCount = parseInt(vscodeMatch[1], 10);
      if (vscodeCount === counts.total) {
        log(`   ✅ VS Code package.json mentions ${vscodeCount} detection rules (correct)`, 'green');
      } else {
        log(`   ❌ VS Code package.json mentions ${vscodeCount} detection rules but actual is ${counts.total}`, 'red');
        log(`      Update: packages/vscode/package.json`, 'red');
        hasErrors = true;
      }
    } else {
      log('   ⚠️  Could not find rule count in VS Code package.json', 'yellow');
    }
  } catch (error) {
    log('   ℹ️  VS Code package.json not found (OK)', 'yellow');
  }

  // Check extension PRIVACY.md
  log('\n🔍 Checking extension PRIVACY.md...', 'blue');
  try {
    const privacyContent = readFileSync(join(rootDir, 'packages/extension/PRIVACY.md'), 'utf-8');
    const privacyMatch = privacyContent.match(/(\d+)\s+rules/);
    if (privacyMatch) {
      const privacyCount = parseInt(privacyMatch[1], 10);
      if (privacyCount === counts.total) {
        log(`   ✅ PRIVACY.md mentions ${privacyCount} rules (correct)`, 'green');
      } else {
        log(`   ❌ PRIVACY.md mentions ${privacyCount} rules but actual is ${counts.total}`, 'red');
        log(`      Update: packages/extension/PRIVACY.md`, 'red');
        hasErrors = true;
      }
    } else {
      log('   ⚠️  Could not find rule count in PRIVACY.md', 'yellow');
    }
  } catch (error) {
    log('   ℹ️  Extension PRIVACY.md not found (OK)', 'yellow');
  }

  // Check extension bundle
  log('\n🔍 Checking extension bundle...', 'blue');
  try {
    const extensionBgPath = join(rootDir, 'packages/extension/dist/chrome/background.js');
    const bgContent = readFileSync(extensionBgPath, 'utf-8');

    // Check if scanner rules are bundled by looking for rule IDs
    const sampleRuleIds = ['kw-ignore-instructions', 'kw-dan-jailbreak', 'rx-base64-pattern', 'kw-conversation-reset'];
    const foundCount = sampleRuleIds.filter(id => bgContent.includes(id)).length;
    if (foundCount >= 3) {
      log(`   ✅ Extension bundle includes detection rules (${foundCount}/${sampleRuleIds.length} sample IDs found)`, 'green');
    } else {
      log('   ⚠️  Extension might not include all rules', 'yellow');
      log('      Run: pnpm build:extensions', 'yellow');
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
