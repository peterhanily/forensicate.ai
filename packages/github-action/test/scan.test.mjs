import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scan.mjs', import.meta.url));

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'forensicate-action-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, 'notes.md'), 'A short meeting agenda about next week.');
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'docs', 'notes.md'), 'Another meeting agenda.');
  // Exercise reporting options without ever contacting GitHub.
  writeFileSync(join(cwd, 'block-network.mjs'), `
    import { writeFileSync } from 'node:fs';
    globalThis.fetch = async () => {
      writeFileSync(new URL('./network-attempt', import.meta.url), 'blocked');
      throw new Error('Network is disabled in action tests');
    };
  `);
  return cwd;
}

function run(cwd, inputs = {}) {
  const result = spawnSync(process.execPath, ['--import', join(cwd, 'block-network.mjs'), script], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      INPUT_SCAN_MODE: 'all',
      INPUT_PATHS: '**/*.md',
      INPUT_CONFIDENCE_THRESHOLD: '',
      INPUT_FAIL_ON_FINDING: 'false',
      INPUT_COMMENT_ON_PR: 'false',
      INPUT_SARIF_UPLOAD: 'false',
      INPUT_GITHUB_TOKEN: '',
      GITHUB_TOKEN: '',
      GITHUB_EVENT_PATH: '',
      GITHUB_STEP_SUMMARY: '',
      GITHUB_OUTPUT: join(cwd, 'outputs.txt'),
      ...inputs,
    },
  });
  return { ...result, outputs: existsSync(join(cwd, 'outputs.txt')) ? readFileSync(join(cwd, 'outputs.txt'), 'utf8') : '' };
}

function assertIncompleteScan(cwd, inputs = {}) {
  const eventPath = join(cwd, 'comment-event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1 } }));
  const summaryPath = join(cwd, 'summary.txt');
  const result = run(cwd, {
    INPUT_SARIF_UPLOAD: 'true',
    INPUT_COMMENT_ON_PR: 'true',
    INPUT_GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'example/fixture',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    ...inputs,
  });
  assert.equal(result.status, 2, result.stderr || String(result.error));
  assert.equal(result.outputs, '');
  assert.equal(existsSync(join(cwd, 'forensicate-results.sarif')), false);
  assert.equal(existsSync(summaryPath), false);
  assert.equal(existsSync(join(cwd, 'network-attempt')), false);
  assert.doesNotMatch(result.stdout, /No prompt injection patterns|All clear|findings-count=/);
  return result;
}

function changedFixture(t) {
  const cwd = fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Forensicate tests');
  git('config', 'user.email', 'test@example.invalid');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Initial documents');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'notes.md'), 'Updated meeting agenda.');
  unlinkSync(join(cwd, 'docs', 'notes.md'));
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Update root document and delete old notes');
  const eventPath = join(cwd, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1, base: { sha: base } } }));
  return { cwd, inputs: { INPUT_SCAN_MODE: 'changed', GITHUB_EVENT_PATH: eventPath } };
}

test('source-built scanner scans root and nested glob matches and honors SARIF false', t => {
  const cwd = fixture(t);
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.outputs, /total-files-scanned=2/);
  assert.match(result.outputs, /findings-count=0/);
  assert.equal(existsSync(join(cwd, 'forensicate-results.sarif')), false);
});

test('unset action inputs retain config values, including a zero threshold', t => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'forensicate.yaml'), 'threshold: 0\nfail-on-finding: false\nscan-mode: all\noutput: sarif\n');
  const result = run(cwd, { INPUT_CONFIDENCE_THRESHOLD: '', INPUT_FAIL_ON_FINDING: '', INPUT_SCAN_MODE: '', INPUT_SARIF_UPLOAD: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Confidence threshold: 0%/);
  assert.match(result.stdout, /Fail on finding: false/);
  assert.match(result.outputs, /sarif-file=/);
  const sarif = JSON.parse(readFileSync(join(cwd, 'forensicate-results.sarif'), 'utf8'));
  assert.equal(sarif.runs[0].invocations[0].properties.filesScanned, 2);
});

test('explicit inputs override config values', t => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'forensicate.yaml'), 'threshold: 70\noutput: sarif\n');
  const result = run(cwd, { INPUT_CONFIDENCE_THRESHOLD: '35' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Confidence threshold: 35%/);
  assert.equal(existsSync(join(cwd, 'forensicate-results.sarif')), false);
});

test('path filters preserve changed-file mode and exclude deleted files', t => {
  const { cwd, inputs } = changedFixture(t);
  const result = run(cwd, inputs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.outputs, /total-files-scanned=1/);
});

test('invalid threshold is rejected instead of silently suppressing findings', t => {
  const cwd = fixture(t);
  const result = run(cwd, { INPUT_CONFIDENCE_THRESHOLD: 'not-a-number' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /confidence-threshold must be a number/);
});

for (const [name, content] of [
  ['ASCII', ' '.repeat(512 * 1024 + 1)],
  ['multibyte UTF-8', 'é'.repeat(256 * 1024 + 1)],
]) {
  test(`oversized ${name} selected files fail before success reporting`, t => {
    const cwd = fixture(t);
    writeFileSync(join(cwd, 'oversized.md'), content);
    const result = assertIncompleteScan(cwd);
    assert.match(result.stderr, /oversized\.md: Input exceeds the 524288-byte read limit/);
  });
}

test('a file exactly at the byte limit remains readable', t => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'empty.md'), ' '.repeat(512 * 1024));
  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  // Whitespace-only files are intentionally not counted as analyzed documents.
  assert.match(result.outputs, /total-files-scanned=2/);
});

test('selected symbolic links fail instead of being silently omitted', t => {
  const cwd = fixture(t);
  symlinkSync('notes.md', join(cwd, 'linked.md'));
  const result = assertIncompleteScan(cwd);
  assert.match(result.stderr, /linked\.md: Symbolic links are not followed/);
});

test('selected FIFOs fail without waiting for a writer', { skip: process.platform === 'win32' }, t => {
  const cwd = fixture(t);
  execFileSync('mkfifo', [join(cwd, 'pipe.md')]);
  const result = assertIncompleteScan(cwd);
  assert.match(result.stderr, /pipe\.md: Expected a regular file/);
});

test('unreadable selected files fail before success reporting', { skip: process.getuid?.() === 0 || process.platform === 'win32' }, t => {
  const cwd = fixture(t);
  const path = join(cwd, 'unreadable.md');
  writeFileSync(path, 'A meeting agenda.');
  chmodSync(path, 0);
  t.after(() => { if (existsSync(path)) chmodSync(path, 0o600); });
  const result = assertIncompleteScan(cwd);
  assert.match(result.stderr, /unreadable\.md: EACCES/);
});

test('inaccessible discovery directories fail instead of disappearing', { skip: process.getuid?.() === 0 || process.platform === 'win32' }, t => {
  const cwd = fixture(t);
  const directory = join(cwd, 'docs');
  chmodSync(directory, 0);
  try {
    const result = assertIncompleteScan(cwd);
    assert.match(result.stderr, /EACCES.*docs/);
  } finally {
    chmodSync(directory, 0o700);
  }
});

for (const replacement of ['missing', 'directory']) {
  test(`a selected changed file that becomes ${replacement} fails explicitly`, t => {
    const { cwd, inputs } = changedFixture(t);
    unlinkSync(join(cwd, 'notes.md'));
    if (replacement === 'directory') mkdirSync(join(cwd, 'notes.md'));
    const result = assertIncompleteScan(cwd, inputs);
    assert.match(result.stderr, replacement === 'missing' ? /notes\.md: ENOENT/ : /notes\.md: Expected a regular file/);
  });
}

test('intentional path, extension, and generated-directory exclusions still apply', t => {
  const cwd = fixture(t);
  for (const directory of ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']) {
    mkdirSync(join(cwd, directory));
    writeFileSync(join(cwd, directory, 'oversized.md'), ' '.repeat(512 * 1024 + 1));
  }
  writeFileSync(join(cwd, 'not-selected.md'), ' '.repeat(512 * 1024 + 1));
  symlinkSync('missing-file', join(cwd, 'notes.png'));
  const result = run(cwd, { INPUT_PATHS: 'notes.* docs/** **/oversized.md' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.outputs, /total-files-scanned=2/);
});
