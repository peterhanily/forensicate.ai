/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { hashToken, validateTokenFormat } from '../auth';

it('generates usable local tokens whose stored hashes match authentication', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'forensicate-test-data-'));
  try {
    const script = fileURLToPath(new URL('../../scripts/setup-test-data.js', import.meta.url).href);
    execFileSync(process.execPath, [script], { cwd: directory, stdio: 'ignore' });
    const values = Object.fromEntries(readFileSync(join(directory, '.tokens'), 'utf8')
      .split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => line.split('=')));
    for (const prefix of ['TEST', 'LIVE']) {
      expect(validateTokenFormat(values[`${prefix}_TOKEN`])).toBe(true);
      expect(await hashToken(values[`${prefix}_TOKEN`])).toBe(values[`${prefix}_TOKEN_HASH`]);
    }
    expect(values.TEST_TOKEN).not.toBe(values.LIVE_TOKEN);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
