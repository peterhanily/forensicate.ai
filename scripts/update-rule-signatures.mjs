// Run after building the scanner with Node 24. Append new definitions; never
// discard old signatures, which recognize legacy version 1 saved settings.
import { readFile, writeFile } from 'node:fs/promises';
import { allRules } from '../packages/scanner/dist/index.js';
import { legacyRuleIdentifier } from '../packages/app/src/lib/storage/ruleSignature.ts';

const path = new URL('../packages/app/src/lib/storage/legacyRuleSignatures.json', import.meta.url);
const known = JSON.parse(await readFile(path, 'utf8'));
let added = 0;
for (const rule of allRules) {
  const signature = legacyRuleIdentifier(rule);
  if (!known.includes(signature)) {
    known.push(signature);
    added++;
  }
}
if (added) await writeFile(path, JSON.stringify(known, null, 2) + '\n');
console.log(`Added ${added} legacy rule definition identifiers.`);
