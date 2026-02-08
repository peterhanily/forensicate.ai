import type { PromptItem } from '../data/samplePrompts';
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

function exportCSV(batchResults: Array<{ prompt: PromptItem; result: ScanResult }>) {
  const headers = ['Prompt Name', 'Tags', 'Status', 'Confidence', 'Matched Rules', 'Timestamp'];
  const rows = batchResults.map(({ prompt, result }) => [
    `"${prompt.name.replace(/"/g, '""')}"`,
    `"${prompt.tags.join(', ')}"`,
    result.isPositive ? 'DETECTED' : 'CLEAN',
    result.confidence.toString(),
    `"${result.matchedRules.map(r => r.ruleName).join(', ')}"`,
    result.timestamp.toISOString(),
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  downloadFile(csv, `forensicate-batch-${timestamp}.csv`, 'text/csv');
}

function exportJSON(batchResults: Array<{ prompt: PromptItem; result: ScanResult }>) {
  const data = {
    exportedAt: new Date().toISOString(),
    totalScanned: batchResults.length,
    detected: batchResults.filter(r => r.result.isPositive).length,
    clean: batchResults.filter(r => !r.result.isPositive).length,
    results: batchResults.map(({ prompt, result }) => ({
      prompt: {
        name: prompt.name,
        tags: prompt.tags,
        content: prompt.content,
      },
      scan: {
        isPositive: result.isPositive,
        confidence: result.confidence,
        matchedRules: result.matchedRules.map(r => ({
          ruleName: r.ruleName,
          ruleId: r.ruleId,
          severity: r.severity,
          matches: r.matches,
        })),
        compoundThreats: result.compoundThreats ?? [],
        reasons: result.reasons,
        timestamp: result.timestamp.toISOString(),
      },
    })),
  };

  const json = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  downloadFile(json, `forensicate-batch-${timestamp}.json`, 'application/json');
}

interface BatchResultsModalProps {
  batchResults: Array<{ prompt: PromptItem; result: ScanResult }>;
  onClose: () => void;
  onClearAndClose: () => void;
}

export default function BatchResultsModal({
  batchResults,
  onClose,
  onClearAndClose,
}: BatchResultsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-[#c9a227]">Batch Scan Results</h3>
            <p className="text-gray-500 text-xs">{batchResults.length} prompts scanned</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-300">
                {batchResults.filter(r => r.result.isPositive).length} Detected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-300">
                {batchResults.filter(r => !r.result.isPositive).length} Clean
              </span>
            </div>
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {batchResults.map(({ prompt, result }) => (
            <div
              key={prompt.id}
              className={`px-4 py-3 border-b border-gray-800 ${result.isPositive ? 'bg-red-900/10' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${result.isPositive ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span className="text-gray-200 text-sm font-medium">{prompt.name}</span>
                </div>
                <span className={`text-xs ${result.isPositive ? 'text-red-400' : 'text-green-400'}`}>
                  {result.confidence}% confidence
                </span>
              </div>
              {result.isPositive && result.matchedRules.length > 0 && (
                <div className="mt-2 pl-4 space-y-1">
                  {result.matchedRules.slice(0, 3).map((match, idx) => (
                    <div key={idx} className="text-xs text-gray-500">
                      • {match.ruleName}
                    </div>
                  ))}
                  {result.matchedRules.length > 3 && (
                    <div className="text-xs text-gray-600">
                      +{result.matchedRules.length - 3} more rules triggered
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 bg-gray-800/30 flex-shrink-0 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => exportCSV(batchResults)}
              className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
            </button>
            <button
              onClick={() => exportJSON(batchResults)}
              className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              JSON
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClearAndClose}
              className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            >
              Clear Selection & Close
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-[#c9a227] hover:bg-[#d4b030] text-gray-900 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
