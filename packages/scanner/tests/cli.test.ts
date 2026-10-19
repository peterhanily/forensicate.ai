import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBoundedStdin } from '../src/cliInput.js';
import { MAX_SCAN_LENGTH } from '../src/scanner.js';

const require = createRequire(import.meta.url);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const noRules = ['--categories', '__boundary_test_no_rules__'];
let buildDir: string;
let cwd: string;

beforeAll(() => {
  // Exercise the emitted CLI, including its real exit status, without using a
  // stale dist/ or modifying another concurrently running package build.
  buildDir = mkdtempSync(join(packageRoot, '.cli-test-'));
  execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'), '--outDir', buildDir], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
}, 30_000);

afterAll(() => { if (buildDir) rmSync(buildDir, { recursive: true, force: true }); });
beforeEach(() => { cwd = realpathSync(mkdtempSync(join(tmpdir(), 'forensicate-cli-'))); });
afterEach(() => { if (cwd) rmSync(cwd, { recursive: true, force: true }); });

function run(args: string[], input = '') {
  return spawnSync(process.execPath, [join(buildDir, 'cli.js'), ...args], {
    cwd,
    encoding: 'utf8',
    input,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function file(name: string, content = 'A meeting agenda about next week.'): string {
  const path = join(cwd, name);
  writeFileSync(path, content);
  return path;
}

function expectInputError(result: ReturnType<typeof run>, diagnostic: RegExp): void {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toMatch(diagnostic);
}

describe('CLI input contract', () => {
  it('reports clean scans as exit 0 and findings as exit 1', () => {
    const clean = run(['--json', file('clean.txt')]);
    expect(clean.status, clean.stderr).toBe(0);
    expect(JSON.parse(clean.stdout).isPositive).toBe(false);

    const found = run(['--json', file('education.txt', 'This is for educational purposes.')]);
    expect(found.status, found.stderr).toBe(1);
    expect(JSON.parse(found.stdout).isPositive).toBe(true);
  });

  it.each(['--json', '--sarif', '--quiet'])('suppresses %s results if a later named input is missing', format => {
    const clean = file('clean.txt');
    expectInputError(run([format, clean, 'missing.txt']), /missing\.txt.*ENOENT|ENOENT.*missing\.txt/);
  });

  it('does not ignore named files when stdin is also requested', () => {
    expectInputError(run(['--stdin', '--json', 'missing.txt'], 'A meeting agenda.'), /missing\.txt/);
    const result = run(['--stdin', '--json', file('notes.txt')], 'Another meeting agenda.');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).map((item: { file: string | null }) => item.file)).toEqual([null, join(cwd, 'notes.txt')]);
  });

  it('keeps empty and whitespace-only explicit files in the JSON report', () => {
    const result = run(['--json', file('empty.txt', ''), file('blank.txt', ' \n\t')]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveLength(2);
  });

  it('fails when directory filters select no input files', () => {
    const dir = join(cwd, 'empty');
    mkdirSync(dir);
    expectInputError(run(['--sarif', dir]), /No eligible input files/);
    expectInputError(run(['--json', file('notes.txt'), dir]), /No eligible input files/);
  });

  it.each(['--json', '--sarif'])('rejects oversized stdin without a %s report', format => {
    expectInputError(run(['--stdin', format], ' '.repeat(MAX_SCAN_LENGTH + 1)), /stdin:.*UTF-16.*limit/);
  });

  it('accepts stdin at the exact UTF-16 boundary', () => {
    const result = run(['--stdin', '--json', ...noRules], ' '.repeat(MAX_SCAN_LENGTH));
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).isPositive).toBe(false);
  });

  it('enforces the file byte budget for explicit and discovered files', () => {
    file('forensicate.yaml', 'max-file-size-kb: 1\n');
    const dir = join(cwd, 'documents');
    mkdirSync(dir);
    const path = join(dir, 'notes.txt');
    writeFileSync(path, ' '.repeat(1025));
    expectInputError(run(['--json', path]), /notes\.txt:.*1024-byte/);
    expectInputError(run(['--sarif', dir]), /notes\.txt:.*1024-byte/);
  });

  it('accepts a file at the exact configured byte boundary', () => {
    file('forensicate.yaml', 'max-file-size-kb: 1\n');
    const result = run(['--json', file('notes.txt', ' '.repeat(1024)), ...noRules]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).file).toBe(join(cwd, 'notes.txt'));
  });

  it('cannot raise the shared text limit through max-file-size-kb', () => {
    file('forensicate.yaml', 'max-file-size-kb: 4096\n');
    expectInputError(run(['--json', file('notes.txt', ' '.repeat(MAX_SCAN_LENGTH + 1))]), /notes\.txt:.*UTF-16.*limit/);
  });

  it('bounds configuration reads', () => {
    expectInputError(run(['--config', file('large.yaml', '#'.repeat(64 * 1024 + 1)), '--stdin']), /large\.yaml:.*65536-byte/);
  });

  it.each([['--config'], ['--threshold', 'oops'], ['--min-severity', 'oops'], ['--unknown']])('rejects malformed arguments %j', (...args) => {
    expectInputError(run(args), /Missing value|Threshold must|Minimum severity|Unknown option/);
  });

  it('accepts explicit names beginning with a dash after --', () => {
    file('-notes.txt');
    const result = run(['--json', '--', '-notes.txt']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).file).toBe(join(cwd, '-notes.txt'));
  });
});

describe.skipIf(process.platform === 'win32')('CLI filesystem traversal', () => {
  it('rejects an explicit file symlink and a broken symlink', () => {
    symlinkSync(file('notes.txt'), join(cwd, 'linked.txt'));
    symlinkSync(join(cwd, 'missing.txt'), join(cwd, 'broken.txt'));
    expectInputError(run(['--json', 'linked.txt']), /Symbolic links are not followed/);
    expectInputError(run(['--sarif', 'broken.txt']), /Symbolic links are not followed/);
  });

  it('rejects a directory symlink and a discovered directory cycle', () => {
    const dir = join(cwd, 'documents');
    mkdirSync(dir);
    writeFileSync(join(dir, 'notes.txt'), 'A meeting agenda.');
    symlinkSync(dir, join(cwd, 'linked'), 'dir');
    expectInputError(run(['--json', 'linked']), /Symbolic links are not followed/);
    symlinkSync(dir, join(dir, 'cycle'), 'dir');
    expectInputError(run(['--sarif', dir]), /cycle:.*Symbolic links are not followed/);
  });

  it('retains extension filters and dependency/build directory exclusions', () => {
    const dir = join(cwd, 'documents');
    mkdirSync(dir);
    writeFileSync(join(dir, 'notes.txt'), 'A meeting agenda.');
    writeFileSync(join(dir, 'ignored.bin'), ' '.repeat(MAX_SCAN_LENGTH + 1));
    for (const name of ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']) {
      symlinkSync(dir, join(dir, name), 'dir');
    }
    const result = run(['--json', dir]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).file).toBe(join(dir, 'notes.txt'));
  });

  it('rejects explicit and discovered special files without opening them', () => {
    const dir = join(cwd, 'documents');
    mkdirSync(dir);
    const fifo = join(dir, 'named-pipe.txt');
    execFileSync('mkfifo', [fifo]);
    expectInputError(run(['--json', fifo]), /Expected a regular file or directory/);
    expectInputError(run(['--sarif', dir]), /Expected a regular file or directory/);
  });

  it.skipIf(process.getuid?.() === 0)('fails on an unreadable selected file and unreadable directory', () => {
    const path = file('unreadable.txt');
    chmodSync(path, 0);
    try {
      expectInputError(run(['--quiet', path]), /EACCES|EPERM/);
    } finally {
      chmodSync(path, 0o600);
    }
    const dir = join(cwd, 'private');
    mkdirSync(dir);
    chmodSync(dir, 0);
    try {
      expectInputError(run(['--sarif', dir]), /EACCES|EPERM/);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});

describe('bounded UTF-8 input decoding', () => {
  it('preserves Unicode split across byte chunks', async () => {
    const bytes = Buffer.from('A meeting 🌿 agenda.');
    async function* chunks() {
      for (const byte of bytes) yield Buffer.from([byte]);
    }
    expect(await readBoundedStdin(chunks())).toBe('A meeting 🌿 agenda.');
  });

  it('measures decoded UTF-16 units rather than UTF-8 bytes', async () => {
    const text = '🌿'.repeat(MAX_SCAN_LENGTH / 2);
    async function* chunks() {
      const bytes = Buffer.from(text);
      for (let i = 0; i < bytes.length; i += 64 * 1024) yield bytes.subarray(i, i + 64 * 1024);
    }
    expect(await readBoundedStdin(chunks())).toBe(text);
  });

  it('stops consuming a stream at the limit instead of draining its remainder', async () => {
    let chunksRead = 0;
    let closed = false;
    async function* chunks() {
      try {
        for (let i = 0; i < 30; i++) {
          chunksRead++;
          yield Buffer.alloc(64 * 1024, ' ');
        }
      } finally {
        closed = true;
      }
    }
    await expect(readBoundedStdin(chunks())).rejects.toThrow(/UTF-16.*limit/);
    expect(chunksRead).toBe(16);
    expect(closed).toBe(true);
  });
});
