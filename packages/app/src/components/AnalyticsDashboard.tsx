import { useState, useMemo } from 'react';
import type { ScanResult } from '@forensicate/scanner';
import type { ScanHistoryEntry } from './ScanHistory';
import type { PromptItem } from '../data/samplePrompts';

// ============================================================================
// Analytics Dashboard Component
// ============================================================================

interface AnalyticsDashboardProps {
  scanHistory: ScanHistoryEntry[];
  batchResults: Array<{ prompt: PromptItem; result: ScanResult }> | null;
}

export default function AnalyticsDashboard({
  scanHistory,
  batchResults,
}: AnalyticsDashboardProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Combine all results for analytics
  const allResults = useMemo(() => {
    const results: ScanResult[] = scanHistory.map(e => e.result);
    if (batchResults) {
      results.push(...batchResults.map(b => b.result));
    }
    return results;
  }, [scanHistory, batchResults]);

  // Top triggered rules
  const ruleFrequency = useMemo(() => {
    const freq: Record<string, { name: string; count: number; severity: string }> = {};
    for (const result of allResults) {
      for (const match of result.matchedRules) {
        if (!freq[match.ruleId]) {
          freq[match.ruleId] = { name: match.ruleName, count: 0, severity: match.severity };
        }
        freq[match.ruleId].count++;
      }
    }
    return Object.values(freq)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [allResults]);

  // Category distribution
  const categoryDistribution = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const result of allResults) {
      for (const match of result.matchedRules) {
        const cat = match.ruleType === 'keyword' ? 'Keyword'
          : match.ruleType === 'regex' ? 'Regex'
          : match.ruleType === 'heuristic' ? 'Heuristic'
          : match.ruleType;
        cats[cat] = (cats[cat] || 0) + 1;
      }
    }
    return Object.entries(cats)
      .sort(([, a], [, b]) => b - a);
  }, [allResults]);

  // Severity distribution
  const severityDistribution = useMemo(() => {
    const sev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const result of allResults) {
      for (const match of result.matchedRules) {
        sev[match.severity] = (sev[match.severity] || 0) + 1;
      }
    }
    return sev;
  }, [allResults]);

  // Only show when we have enough data
  const show = scanHistory.length >= 5 || (batchResults !== null && batchResults.length > 0);
  if (!show) return null;

  // Summary stats
  const totalScans = allResults.length;
  const detectedCount = allResults.filter(r => r.isPositive).length;
  const detectionRate = totalScans > 0 ? Math.round((detectedCount / totalScans) * 100) : 0;
  const avgConfidence = totalScans > 0
    ? Math.round(allResults.reduce((sum, r) => sum + r.confidence, 0) / totalScans)
    : 0;

  const maxRuleCount = ruleFrequency.length > 0 ? ruleFrequency[0].count : 1;
  const maxCatCount = categoryDistribution.length > 0 ? categoryDistribution[0][1] : 1;
  const maxSevCount = Math.max(...Object.values(severityDistribution), 1);

  const severityColor: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
  };

  const severityTextColor: Record<string, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
  };

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700 hover:bg-gray-800/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs font-mono">analytics</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-[#c9a227]/20 text-[#c9a227] rounded-full font-medium">
            {totalScans} scans
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="p-3 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-gray-200">{totalScans}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total Scans</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
              <div className={`text-lg font-bold ${detectionRate > 50 ? 'text-red-400' : 'text-green-400'}`}>
                {detectionRate}%
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Detection Rate</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-[#c9a227]">{avgConfidence}%</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Avg Confidence</div>
            </div>
          </div>

          {/* Top 10 Triggered Rules */}
          {ruleFrequency.length > 0 && (
            <div>
              <h4 className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
                Top Triggered Rules
              </h4>
              <div className="space-y-1.5">
                {ruleFrequency.map((rule) => (
                  <div key={rule.name} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-24 truncate flex-shrink-0" title={rule.name}>
                      {rule.name}
                    </span>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${severityColor[rule.severity] || 'bg-gray-500'}`}
                        style={{ width: `${(rule.count / maxRuleCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-6 text-right font-mono">{rule.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Distribution */}
          {categoryDistribution.length > 0 && (
            <div>
              <h4 className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
                Rule Type Distribution
              </h4>
              <div className="space-y-1.5">
                {categoryDistribution.map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-16 flex-shrink-0">{cat}</span>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#c9a227] transition-all"
                        style={{ width: `${(count / maxCatCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-6 text-right font-mono">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Severity Distribution */}
          {Object.values(severityDistribution).some(v => v > 0) && (
            <div>
              <h4 className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
                Severity Distribution
              </h4>
              <div className="space-y-1.5">
                {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <div key={sev} className="flex items-center gap-2">
                    <span className={`text-[10px] w-14 flex-shrink-0 capitalize ${severityTextColor[sev]}`}>
                      {sev}
                    </span>
                    <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${severityColor[sev]}`}
                        style={{ width: `${(severityDistribution[sev] / maxSevCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-6 text-right font-mono">
                      {severityDistribution[sev]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
