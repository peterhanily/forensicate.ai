import * as vscode from 'vscode';
import { scanPrompt, getEnabledRules } from '@forensicate/scanner';
import type { ScanResult, RuleMatch, DetectionRule } from '@forensicate/scanner';

let diagnosticCollection: vscode.DiagnosticCollection;
let cachedRules: DetectionRule[] | null = null;
let statusBarItem: vscode.StatusBarItem;
let diagnosticsEnabled = true;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('forensicate');
  context.subscriptions.push(diagnosticCollection);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'forensicate.toggleDiagnostics';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Load config
  diagnosticsEnabled = getConfig().get('enableDiagnostics', true);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('forensicate.scanSelection', scanSelection),
    vscode.commands.registerCommand('forensicate.scanFile', scanCurrentFile),
    vscode.commands.registerCommand('forensicate.toggleDiagnostics', toggleDiagnostics),
  );

  // Real-time diagnostics on text change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (diagnosticsEnabled && matchesFilePattern(e.document)) {
        debouncedScanDocument(e.document);
      }
    }),
  );

  // Scan on file open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => {
      if (diagnosticsEnabled && matchesFilePattern(doc)) {
        scanDocument(doc);
      }
    }),
  );

  // Scan on save (if enabled)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (getConfig().get('scanOnSave', false) && matchesFilePattern(doc)) {
        scanDocument(doc);
      }
    }),
  );

  // Clear diagnostics when closing files
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(doc => {
      diagnosticCollection.delete(doc.uri);
    }),
  );

  // Config change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('forensicate')) {
        diagnosticsEnabled = getConfig().get('enableDiagnostics', true);
        updateStatusBar();
        if (!diagnosticsEnabled) {
          diagnosticCollection.clear();
        }
      }
    }),
  );

  // Scan already-open files
  if (diagnosticsEnabled) {
    for (const editor of vscode.window.visibleTextEditors) {
      if (matchesFilePattern(editor.document)) {
        scanDocument(editor.document);
      }
    }
  }
}

export function deactivate() {
  diagnosticCollection?.dispose();
  statusBarItem?.dispose();
  if (debounceTimer) clearTimeout(debounceTimer);
}

function getConfig() {
  return vscode.workspace.getConfiguration('forensicate');
}

function getRules(): DetectionRule[] {
  if (!cachedRules) {
    cachedRules = getEnabledRules();
  }
  return cachedRules;
}

function updateStatusBar() {
  statusBarItem.text = diagnosticsEnabled
    ? '$(shield) Forensicate'
    : '$(shield) Forensicate (off)';
  statusBarItem.tooltip = diagnosticsEnabled
    ? 'Forensicate.ai: Real-time scanning enabled. Click to toggle.'
    : 'Forensicate.ai: Scanning disabled. Click to toggle.';
}

function matchesFilePattern(document: vscode.TextDocument): boolean {
  const patterns: string[] = getConfig().get('filePatterns', [
    '**/*.md', '**/*.txt', '**/*.prompt', '**/*.json', '**/*.yaml', '**/*.yml',
  ]);
  const relativePath = vscode.workspace.asRelativePath(document.uri);
  return patterns.some(pattern => {
    const regex = globToRegex(pattern);
    return regex.test(relativePath);
  });
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function debouncedScanDocument(document: vscode.TextDocument) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scanDocument(document), 500);
}

function scanDocument(document: vscode.TextDocument) {
  const text = document.getText();
  if (!text.trim()) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  // Limit scan to 100KB
  const scanText = text.length > 100000 ? text.substring(0, 100000) : text;
  const threshold = getConfig().get('confidenceThreshold', 50);
  const rules = getRules();

  try {
    const result = scanPrompt(scanText, rules, threshold);
    const diagnostics = resultToDiagnostics(result, document);
    diagnosticCollection.set(document.uri, diagnostics);

    // Update status bar with result
    if (result.isPositive) {
      statusBarItem.text = `$(warning) Forensicate: ${result.confidence}%`;
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.text = '$(shield) Forensicate';
      statusBarItem.backgroundColor = undefined;
    }
  } catch (error) {
    console.error('Forensicate scan error:', error);
  }
}

function resultToDiagnostics(result: ScanResult, document: vscode.TextDocument): vscode.Diagnostic[] {
  if (!result.isPositive) return [];

  const diagnostics: vscode.Diagnostic[] = [];

  for (const match of result.matchedRules) {
    const severity = matchSeverity(match);

    if (match.positions && match.positions.length > 0) {
      // Use exact positions from rule matches
      for (const pos of match.positions.slice(0, 10)) {
        const startPos = document.positionAt(pos.start);
        const endPos = document.positionAt(pos.end);
        const range = new vscode.Range(startPos, endPos);
        const diag = new vscode.Diagnostic(
          range,
          `[${match.severity.toUpperCase()}] ${match.ruleName}${match.confidenceImpact != null ? ` (+${match.confidenceImpact}pts)` : ''}`,
          severity,
        );
        diag.source = 'Forensicate.ai';
        diag.code = match.ruleId;
        diagnostics.push(diag);
      }
    } else if (match.matches && match.matches.length > 0) {
      // Find match positions in text
      const text = document.getText();
      for (const matchText of match.matches.slice(0, 5)) {
        const idx = text.toLowerCase().indexOf(matchText.toLowerCase());
        if (idx >= 0) {
          const startPos = document.positionAt(idx);
          const endPos = document.positionAt(idx + matchText.length);
          const range = new vscode.Range(startPos, endPos);
          const diag = new vscode.Diagnostic(
            range,
            `[${match.severity.toUpperCase()}] ${match.ruleName}: "${matchText}"`,
            severity,
          );
          diag.source = 'Forensicate.ai';
          diag.code = match.ruleId;
          diagnostics.push(diag);
        }
      }
    } else {
      // No position info — apply to first line
      const range = new vscode.Range(0, 0, 0, 1);
      const diag = new vscode.Diagnostic(
        range,
        `[${match.severity.toUpperCase()}] ${match.ruleName}`,
        severity,
      );
      diag.source = 'Forensicate.ai';
      diag.code = match.ruleId;
      diagnostics.push(diag);
    }
  }

  return diagnostics;
}

function matchSeverity(match: RuleMatch): vscode.DiagnosticSeverity {
  switch (match.severity) {
    case 'critical': return vscode.DiagnosticSeverity.Error;
    case 'high': return vscode.DiagnosticSeverity.Error;
    case 'medium': return vscode.DiagnosticSeverity.Warning;
    case 'low': return vscode.DiagnosticSeverity.Information;
    default: return vscode.DiagnosticSeverity.Hint;
  }
}

async function scanSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection);

  if (!text.trim()) {
    vscode.window.showInformationMessage('No text selected. Please select text to scan.');
    return;
  }

  const rules = getRules();
  const result = scanPrompt(text, rules, 0);

  showResultPanel(result, text);
}

async function scanCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active editor');
    return;
  }

  const text = editor.document.getText();
  if (!text.trim()) {
    vscode.window.showInformationMessage('File is empty');
    return;
  }

  const rules = getRules();
  const result = scanPrompt(text, rules, 0);
  const diagnostics = resultToDiagnostics(result, editor.document);
  diagnosticCollection.set(editor.document.uri, diagnostics);

  showResultPanel(result, text.substring(0, 500));
}

function toggleDiagnostics() {
  diagnosticsEnabled = !diagnosticsEnabled;
  const config = getConfig();
  config.update('enableDiagnostics', diagnosticsEnabled, vscode.ConfigurationTarget.Global);
  updateStatusBar();

  if (!diagnosticsEnabled) {
    diagnosticCollection.clear();
    vscode.window.showInformationMessage('Forensicate.ai diagnostics disabled');
  } else {
    vscode.window.showInformationMessage('Forensicate.ai diagnostics enabled');
    // Re-scan open files
    for (const editor of vscode.window.visibleTextEditors) {
      if (matchesFilePattern(editor.document)) {
        scanDocument(editor.document);
      }
    }
  }
}

function showResultPanel(result: ScanResult, text: string) {
  const panel = vscode.window.createWebviewPanel(
    'forensicateResult',
    'Forensicate.ai Scan Result',
    vscode.ViewColumn.Beside,
    { enableScripts: false },
  );

  const statusColor = result.isPositive ? '#ef4444' : result.matchedRules.length > 0 ? '#eab308' : '#22c55e';
  const statusLabel = result.isPositive ? 'INJECTION DETECTED' : result.matchedRules.length > 0 ? 'BELOW THRESHOLD' : 'NO THREAT DETECTED';
  const risk = result.confidence >= 70 ? 'HIGH' : result.confidence >= 30 ? 'MEDIUM' : 'LOW';

  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const matchRows = result.matchedRules
    .slice()
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    })
    .map(m => {
      const sevColor = m.severity === 'critical' ? '#ef4444' : m.severity === 'high' ? '#f97316' : m.severity === 'medium' ? '#eab308' : '#22c55e';
      return `<tr>
        <td>${escapeHtml(m.ruleName)}</td>
        <td><span style="color:${sevColor};font-weight:600">${m.severity.toUpperCase()}</span></td>
        <td>${m.confidenceImpact != null ? `+${m.confidenceImpact}pts` : ''}</td>
        <td style="font-size:11px;color:#999">${escapeHtml((m.matches || []).slice(0, 3).join(', '))}</td>
      </tr>`;
    }).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1 { font-size: 18px; color: #c9a227; margin-bottom: 16px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; font-size: 14px; background: ${statusColor}20; color: ${statusColor}; }
    .confidence { font-size: 28px; font-weight: 700; color: ${statusColor}; margin: 0 12px; }
    .meta { display: flex; gap: 16px; margin: 12px 0; font-size: 12px; color: #999; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; padding: 8px; font-size: 11px; color: #999; text-transform: uppercase; border-bottom: 1px solid #333; }
    td { padding: 8px; font-size: 13px; border-bottom: 1px solid #222; }
    pre { background: #1a1a1a; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>Forensicate.ai Scan Result</h1>
  <div style="display:flex;align-items:center;margin-bottom:16px">
    <span class="status">${statusLabel}</span>
    <span class="confidence">${result.confidence}%</span>
    <span style="font-size:12px;color:#999">confidence</span>
  </div>
  <div class="meta">
    <span>Risk: <strong>${risk}</strong></span>
    <span>Rules checked: <strong>${result.totalRulesChecked}</strong></span>
    <span>Triggered: <strong>${result.matchedRules.length}</strong></span>
  </div>

  <h2 style="font-size:14px;margin:20px 0 8px;border-bottom:1px solid #333;padding-bottom:6px">Scanned Text</h2>
  <pre>${escapeHtml(text)}</pre>

  ${result.matchedRules.length > 0 ? `
  <h2 style="font-size:14px;margin:20px 0 8px;border-bottom:1px solid #333;padding-bottom:6px">Triggered Rules (${result.matchedRules.length})</h2>
  <table>
    <thead><tr><th>Rule</th><th>Severity</th><th>Impact</th><th>Matches</th></tr></thead>
    <tbody>${matchRows}</tbody>
  </table>
  ` : ''}

  <p style="margin-top:20px;font-size:11px;color:#666;text-align:center">
    Generated by <a href="https://forensicate.ai" style="color:#c9a227">Forensicate.ai</a>
  </p>
</body>
</html>`;
}
