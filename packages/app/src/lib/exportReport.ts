import type { ScanResult } from '@forensicate/scanner';

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

function severityOrder(s: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s] ?? 4;
}

function riskLevel(confidence: number): string {
  return confidence >= 70 ? 'HIGH' : confidence >= 30 ? 'MEDIUM' : 'LOW';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- JSON Export ---

export function exportJSON(scanResult: ScanResult, promptText: string) {
  const data = {
    exportedAt: new Date().toISOString(),
    generator: 'Forensicate.ai',
    version: '1.0',
    prompt: {
      text: promptText,
      length: promptText.length,
    },
    scan: {
      isPositive: scanResult.isPositive,
      confidence: scanResult.confidence,
      riskLevel: riskLevel(scanResult.confidence),
      totalRulesChecked: scanResult.totalRulesChecked,
      matchedRules: scanResult.matchedRules.map(r => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        ruleType: r.ruleType,
        severity: r.severity,
        matches: r.matches,
        confidenceImpact: r.confidenceImpact,
      })),
      compoundThreats: scanResult.compoundThreats ?? [],
      reasons: scanResult.reasons,
      timestamp: scanResult.timestamp.toISOString(),
    },
  };

  downloadFile(JSON.stringify(data, null, 2), `forensicate-report-${timestamp()}.json`, 'application/json');
}

// --- CSV Export ---

export function exportCSV(scanResult: ScanResult, promptText: string) {
  const headers = ['Rule ID', 'Rule Name', 'Type', 'Severity', 'Confidence Impact', 'Matched Text'];
  const rows = scanResult.matchedRules
    .slice()
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    .map(r => [
      r.ruleId,
      `"${r.ruleName.replace(/"/g, '""')}"`,
      r.ruleType,
      r.severity,
      r.confidenceImpact?.toString() ?? '',
      `"${(r.matches || []).slice(0, 3).join('; ').replace(/"/g, '""')}"`,
    ]);

  const meta = [
    `# Forensicate.ai Scan Report`,
    `# Generated: ${new Date().toISOString()}`,
    `# Text Length: ${promptText.length} chars`,
    `# Result: ${scanResult.isPositive ? 'INJECTION DETECTED' : 'Clean'}`,
    `# Confidence: ${scanResult.confidence}%`,
    `# Risk Level: ${riskLevel(scanResult.confidence)}`,
    `# Rules Checked: ${scanResult.totalRulesChecked}`,
    `# Rules Triggered: ${scanResult.matchedRules.length}`,
    '',
  ];

  const csv = [...meta, headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadFile(csv, `forensicate-report-${timestamp()}.csv`, 'text/csv');
}

// --- HTML Report Export ---

export function exportHTML(scanResult: ScanResult, promptText: string) {
  const risk = riskLevel(scanResult.confidence);
  const statusColor = scanResult.isPositive ? '#ef4444' : scanResult.matchedRules.length > 0 ? '#eab308' : '#22c55e';
  const statusLabel = scanResult.isPositive ? 'INJECTION DETECTED' : scanResult.matchedRules.length > 0 ? 'BELOW THRESHOLD' : 'NO THREAT DETECTED';

  const matchRows = scanResult.matchedRules
    .slice()
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    .map(r => {
      const sevColor = r.severity === 'critical' ? '#ef4444' : r.severity === 'high' ? '#f97316' : r.severity === 'medium' ? '#eab308' : '#22c55e';
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #374151">${escapeHtml(r.ruleName)}</td>
        <td style="padding:8px;border-bottom:1px solid #374151"><span style="color:${sevColor};font-weight:600">${r.severity.toUpperCase()}</span></td>
        <td style="padding:8px;border-bottom:1px solid #374151">${r.ruleType}</td>
        <td style="padding:8px;border-bottom:1px solid #374151">${r.confidenceImpact != null ? `+${r.confidenceImpact}pts` : ''}</td>
        <td style="padding:8px;border-bottom:1px solid #374151;font-size:12px;color:#9ca3af">${escapeHtml((r.matches || []).slice(0, 3).join(', '))}</td>
      </tr>`;
    }).join('');

  const compoundSection = (scanResult.compoundThreats && scanResult.compoundThreats.length > 0) ? `
    <h2 style="color:#ef4444;margin-top:24px">Compound Threats (${scanResult.compoundThreats.length})</h2>
    ${scanResult.compoundThreats.map(t => `
      <div style="background:#1f2937;padding:12px;border-radius:8px;margin:8px 0;border-left:3px solid #ef4444">
        <strong>${escapeHtml(t.name)}</strong> <span style="color:#ef4444;font-size:12px">[${t.severity}]</span>
        <p style="color:#9ca3af;margin:4px 0 0">${escapeHtml(t.description)}</p>
      </div>
    `).join('')}
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forensicate.ai Scan Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #030712; color: #f9fafb; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #c9a227; font-size: 24px; margin-bottom: 4px; }
    h2 { color: #e5e7eb; font-size: 16px; margin: 20px 0 12px; border-bottom: 1px solid #374151; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; background: #111827; border-radius: 8px; overflow: hidden; }
    th { background: #1f2937; padding: 10px 8px; text-align: left; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
    td { font-size: 13px; }
    pre { background: #1f2937; padding: 16px; border-radius: 8px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; color: #d1d5db; max-height: 300px; overflow-y: auto; }
    .card { background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 20px; margin: 16px 0; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; font-size: 14px; }
    .meta { display: flex; gap: 24px; flex-wrap: wrap; margin: 12px 0; }
    .meta-item { font-size: 13px; color: #9ca3af; }
    .meta-value { color: #f9fafb; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #374151; text-align: center; font-size: 11px; color: #6b7280; }
    @media print { body { background: #fff; color: #111; } .card { border-color: #ddd; } pre { background: #f3f4f6; color: #111; } table, th, td { border: 1px solid #ddd; } th { background: #f3f4f6; } }
  </style>
</head>
<body>
  <h1>Forensicate.ai Scan Report</h1>
  <p style="color:#9ca3af;font-size:13px">Generated ${new Date().toLocaleString()}</p>

  <div class="card">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
      <span class="status" style="background:${statusColor}20;color:${statusColor}">${statusLabel}</span>
      <span style="font-size:28px;font-weight:700;color:${statusColor}">${scanResult.confidence}%</span>
      <span style="font-size:13px;color:#9ca3af">confidence</span>
    </div>
    <div class="meta">
      <div class="meta-item">Risk Level: <span class="meta-value">${risk}</span></div>
      <div class="meta-item">Rules Checked: <span class="meta-value">${scanResult.totalRulesChecked}</span></div>
      <div class="meta-item">Rules Triggered: <span class="meta-value">${scanResult.matchedRules.length}</span></div>
      <div class="meta-item">Text Length: <span class="meta-value">${promptText.length.toLocaleString()} chars</span></div>
    </div>
  </div>

  <h2>Scanned Text</h2>
  <pre>${escapeHtml(promptText)}</pre>

  ${scanResult.matchedRules.length > 0 ? `
  <h2>Triggered Rules (${scanResult.matchedRules.length})</h2>
  <table>
    <thead><tr><th>Rule</th><th>Severity</th><th>Type</th><th>Impact</th><th>Matches</th></tr></thead>
    <tbody>${matchRows}</tbody>
  </table>
  ` : '<h2>No Rules Triggered</h2><p style="color:#22c55e">The scanned text appears clean.</p>'}

  ${compoundSection}

  <div class="footer">
    Generated by <a href="https://forensicate.ai" style="color:#c9a227;text-decoration:none">Forensicate.ai</a> &mdash; AI Prompt Security Scanner
  </div>
</body>
</html>`;

  downloadFile(html, `forensicate-report-${timestamp()}.html`, 'text/html');
}

// --- SARIF Export (Static Analysis Results Interchange Format) ---

export function exportSARIF(scanResult: ScanResult, promptText: string) {
  const rules: Array<{
    id: string;
    name: string;
    shortDescription: { text: string };
    defaultConfiguration: { level: string };
    properties: { severity: string; ruleType: string };
  }> = [];
  const results: Array<{
    ruleId: string;
    level: string;
    message: { text: string };
    locations: Array<{
      physicalLocation: {
        region: { startLine: number; snippet: { text: string } };
      };
    }>;
    properties: { confidenceImpact: number | undefined };
  }> = [];

  const seenRules = new Set<string>();

  for (const match of scanResult.matchedRules) {
    if (!seenRules.has(match.ruleId)) {
      seenRules.add(match.ruleId);
      rules.push({
        id: match.ruleId,
        name: match.ruleName,
        shortDescription: { text: match.ruleName },
        defaultConfiguration: {
          level: sarifLevel(match.severity),
        },
        properties: {
          severity: match.severity,
          ruleType: match.ruleType,
        },
      });
    }

    results.push({
      ruleId: match.ruleId,
      level: sarifLevel(match.severity),
      message: {
        text: `${match.ruleName}: ${(match.matches || []).slice(0, 3).join(', ') || 'Pattern matched'}`,
      },
      locations: (match.positions || []).slice(0, 5).map(pos => ({
        physicalLocation: {
          region: {
            startLine: 1,
            snippet: { text: promptText.substring(pos.start, pos.end) },
          },
        },
      })),
      properties: {
        confidenceImpact: match.confidenceImpact,
      },
    });
  }

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Forensicate.ai',
            version: '1.0.0',
            informationUri: 'https://forensicate.ai',
            rules,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: true,
            startTimeUtc: scanResult.timestamp.toISOString(),
            properties: {
              confidence: scanResult.confidence,
              riskLevel: riskLevel(scanResult.confidence),
              totalRulesChecked: scanResult.totalRulesChecked,
              isPositive: scanResult.isPositive,
            },
          },
        ],
      },
    ],
  };

  downloadFile(JSON.stringify(sarif, null, 2), `forensicate-report-${timestamp()}.sarif`, 'application/json');
}

function sarifLevel(severity: string): string {
  switch (severity) {
    case 'critical': return 'error';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'note';
    default: return 'none';
  }
}

export type ExportFormat = 'json' | 'csv' | 'html' | 'sarif';

export function exportReport(format: ExportFormat, scanResult: ScanResult, promptText: string) {
  switch (format) {
    case 'json': return exportJSON(scanResult, promptText);
    case 'csv': return exportCSV(scanResult, promptText);
    case 'html': return exportHTML(scanResult, promptText);
    case 'sarif': return exportSARIF(scanResult, promptText);
  }
}
