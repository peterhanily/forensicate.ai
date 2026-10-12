import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MAX_SCAN_LENGTH, ScanInputTooLargeError } from '@forensicate/scanner';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/extension.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['vscode', '@forensicate/scanner'],
});

function document(path, text = 'A meeting agenda.') {
  return {
    uri: { toString: () => path },
    isClosed: false,
    text,
    getText() { return this.text; },
  };
}

function activate(documents, overrides = {}, scanImplementation) {
  const scans = [];
  const commands = {};
  const events = {};
  const timers = new Map();
  const config = { enableDiagnostics: true, confidenceThreshold: 50, ...overrides };
  const diagnostics = new Map();
  const panels = [];
  const errors = [];
  diagnostics.dispose = () => {};
  const status = { show() {}, dispose() {} };
  const subscription = key => callback => { events[key] = callback; return { dispose() {} }; };
  const api = {
    languages: { createDiagnosticCollection: () => diagnostics },
    StatusBarAlignment: { Right: 1 },
    ViewColumn: { Beside: 2 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    Range: class {},
    ThemeColor: class { constructor(id) { this.id = id; } },
    commands: { registerCommand: (id, callback) => { commands[id] = callback; return { dispose() {} }; } },
    window: {
      createStatusBarItem: () => status,
      visibleTextEditors: documents.map(document => ({ document })),
      activeTextEditor: { document: documents[0], selection: {} },
      createWebviewPanel: () => { const panel = { webview: {} }; panels.push(panel); return panel; },
      showErrorMessage: message => errors.push(message),
      showInformationMessage: () => {},
    },
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => config[key] ?? fallback }),
      asRelativePath: uri => uri.toString(),
      onDidChangeTextDocument: subscription('change'),
      onDidOpenTextDocument: subscription('open'),
      onDidSaveTextDocument: subscription('save'),
      onDidCloseTextDocument: subscription('close'),
      onDidChangeConfiguration: subscription('config'),
    },
  };
  const scanner = {
    MAX_SCAN_LENGTH,
    ScanInputTooLargeError,
    getEnabledRules: () => [],
    scanPrompt: (text, rules, threshold) => {
      scans.push({ text, threshold });
      if (text.length > MAX_SCAN_LENGTH) throw new ScanInputTooLargeError(text.length);
      if (scanImplementation) return scanImplementation(text);
      return { isPositive: false, confidence: 0, matchedRules: [], totalRulesChecked: 0 };
    },
  };
  const module = { exports: {} };
  let nextTimer = 0;
  runInNewContext(bundle.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: name => name === 'vscode' ? api : scanner,
    console: { error() {} },
    setTimeout: callback => {
      const id = ++nextTimer;
      timers.set(id, () => { timers.delete(id); callback(); });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  module.exports.activate({ subscriptions: [] });
  return { scans, commands, events, timers, config, diagnostics, status, panels, errors, deactivate: module.exports.deactivate };
}

test('opening root and nested documents produces diagnostics without running a command', () => {
  const root = document('notes.md');
  const nested = document('docs/notes.md');
  const instance = activate([root, nested]);
  assert.equal(instance.scans.length, 2);
  assert.equal(instance.diagnostics.has(root.uri), true);
  assert.equal(instance.diagnostics.has(nested.uri), true);
});

test('disabled diagnostics show the disabled status immediately', () => {
  const instance = activate([document('notes.md')], { enableDiagnostics: false });
  assert.equal(instance.scans.length, 0);
  assert.match(instance.status.text, /off/);
});

test('editing two documents retains pending scans for both documents', () => {
  const first = document('notes.md');
  const second = document('docs/notes.md');
  const instance = activate([first, second]);
  instance.events.change({ document: first });
  instance.events.change({ document: second });
  for (const callback of [...instance.timers.values()]) callback();
  assert.equal(instance.scans.length, 4);
  assert.equal(instance.timers.size, 0);
});

test('disabling diagnostics discards pending scans', () => {
  const doc = document('notes.md');
  const instance = activate([doc]);
  instance.events.change({ document: doc });
  instance.config.enableDiagnostics = false;
  instance.events.config({ affectsConfiguration: () => true });
  assert.equal(instance.timers.size, 0);
  assert.equal(instance.diagnostics.size, 0);
});

test('manual file and selection scans honor the configured threshold', async () => {
  const instance = activate([document('notes.md')], { confidenceThreshold: 65 });
  await instance.commands['forensicate.scanFile']();
  await instance.commands['forensicate.scanSelection']();
  assert.deepEqual(instance.scans.map(scan => scan.threshold), [65, 65, 65]);
});

test('closing a document removes its diagnostics and pending scan', () => {
  const doc = document('notes.md');
  const instance = activate([doc]);
  instance.events.change({ document: doc });
  instance.events.close(doc);
  assert.equal(instance.timers.size, 0);
  assert.equal(instance.diagnostics.has(doc.uri), false);
});

test('automatic scanning accepts the exact editor limit without truncating', () => {
  const text = 'a'.repeat(100_000);
  const doc = document('notes.md', text);
  const instance = activate([doc]);
  assert.equal(instance.scans.length, 1);
  assert.equal(instance.scans[0].text, text);
  assert.equal(instance.diagnostics.get(doc.uri).length, 0);
});

test('automatic scans mark oversized files unscanned instead of scanning a prefix', () => {
  const doc = document('notes.md', 'a'.repeat(100_001));
  const instance = activate([doc]);
  assert.equal(instance.scans.length, 0);
  const [diagnostic] = instance.diagnostics.get(doc.uri);
  assert.equal(diagnostic.code, 'scan-not-completed');
  assert.match(diagnostic.message, /100,000 UTF-16 code unit editor limit/);
  assert.match(diagnostic.message, /Scan Current File/);
  assert.match(instance.status.text, /Not scanned/);
});

test('automatic limits use UTF-16 units and also reject oversized whitespace', () => {
  for (const text of ['📝'.repeat(50_001), ' '.repeat(100_001)]) {
    const doc = document('notes.md', text);
    const instance = activate([doc]);
    assert.equal(instance.scans.length, 0);
    assert.match(instance.diagnostics.get(doc.uri)[0].message, /not scanned automatically/);
  }
});

test('files exceeding the shared limit are directed to a smaller selection', () => {
  const doc = document('notes.md', 'a'.repeat(MAX_SCAN_LENGTH + 1));
  const instance = activate([doc]);
  assert.match(instance.status.tooltip, /1,000,000 UTF-16 code unit manual scan limit/);
  assert.doesNotMatch(instance.status.tooltip, /Run Forensicate: Scan Current File/);
});

test('manual file scans accept the full shared limit and clear automatic warnings', async () => {
  const text = 'a'.repeat(MAX_SCAN_LENGTH - 1) + 'z';
  const doc = document('notes.md', text);
  const instance = activate([doc]);
  instance.events.change({ document: doc });
  await instance.commands['forensicate.scanFile']();
  assert.equal(instance.scans.length, 1);
  assert.equal(instance.scans[0].text, text);
  assert.equal(instance.diagnostics.get(doc.uri).length, 0);
  assert.equal(instance.timers.size, 0);
  assert.equal(instance.panels.length, 1);
  assert.equal(instance.errors.length, 0);
  assert.doesNotMatch(instance.status.text, /Not scanned/);
  assert.match(instance.status.tooltip, /File scan completed/);
});

test('oversized manual file and selection scans show errors without result panels', async () => {
  for (const command of ['forensicate.scanFile', 'forensicate.scanSelection']) {
    for (const text of ['a'.repeat(MAX_SCAN_LENGTH + 1), ' '.repeat(MAX_SCAN_LENGTH + 1)]) {
      const doc = document('notes.md', text);
      const instance = activate([doc], { enableDiagnostics: false });
      await instance.commands[command]();
      assert.equal(instance.panels.length, 0);
      assert.equal(instance.errors.length, 1);
      assert.match(instance.errors[0], /not scanned/);
      assert.match(instance.errors[0], /1,000,000 limit/);
      assert.match(instance.status.text, /Not scanned/);
      if (command === 'forensicate.scanFile') {
        assert.equal(instance.diagnostics.get(doc.uri)[0].code, 'scan-not-completed');
      }
    }
  }
});

test('scan failures replace old diagnostics and success status, and can recover', () => {
  const doc = document('notes.md');
  let fail = false;
  const instance = activate([doc], {}, () => {
    if (fail) throw new Error('Test scanner unavailable');
    return { isPositive: false, confidence: 0, matchedRules: [], totalRulesChecked: 0 };
  });
  instance.diagnostics.set(doc.uri, [{ code: 'previous-finding' }]);
  fail = true;
  instance.events.open(doc);
  assert.equal(instance.diagnostics.get(doc.uri).length, 1);
  assert.equal(instance.diagnostics.get(doc.uri)[0].code, 'scan-not-completed');
  assert.match(instance.status.text, /Not scanned/);
  fail = false;
  instance.events.open(doc);
  assert.equal(instance.diagnostics.get(doc.uri).length, 0);
  assert.doesNotMatch(instance.status.tooltip, /failed/);
});

test('clearing an oversized file removes the stale unscanned warning', () => {
  const doc = document('notes.md', 'a'.repeat(100_001));
  const instance = activate([doc]);
  doc.text = '';
  instance.events.open(doc);
  assert.equal(instance.diagnostics.has(doc.uri), false);
  assert.doesNotMatch(instance.status.text, /Not scanned/);
});
