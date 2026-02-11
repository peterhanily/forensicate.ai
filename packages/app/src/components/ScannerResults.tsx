import type { ScanResult, RuleMatch } from '@forensicate/scanner';

interface ScannerResultsProps {
 scanResult: ScanResult | null;
 promptText: string;
 isScanning: boolean;
 onRuleClick?: (match: RuleMatch) => void;
 isExpanded?: boolean;
 onToggle?: () => void;
}

export default function ScannerResults({
 scanResult,
 promptText,
 isScanning,
 onRuleClick,
 isExpanded = true,
 onToggle,
}: ScannerResultsProps) {
 const headerContent = (
 <>
 <div className="flex items-center gap-2">
 {onToggle && (
 <svg
 className={`w-4 h-4 text-gray-500 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
 fill="none"
 stroke="currentColor"
 viewBox="0 0 24 24"
 >
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
 </svg>
 )}
 <span className="text-gray-400 text-gray-400 text-xs font-mono">scan_results</span>
 </div>
 {scanResult && (
 <span className="text-gray-500 text-gray-500 text-xs font-mono">
 {scanResult.totalRulesChecked} rules checked
 </span>
 )}
 </>
 );

 return (
 <div className="border border-gray-800 border-gray-800 rounded-lg bg-gray-900/50 bg-gray-900/50 overflow-hidden">
 {onToggle ? (
 <button
 onClick={onToggle}
 className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 bg-gray-800/50 border-b border-gray-700 border-gray-700 hover:bg-gray-800/30 dark:hover:bg-gray-800/30 light:hover:bg-gray-100 transition-colors"
 >
 {headerContent}
 </button>
 ) : (
 <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 bg-gray-800/50 border-b border-gray-700 border-gray-700">
 {headerContent}
 </div>
 )}
 {isExpanded && (
 <div className="p-4 min-h-[180px] max-h-[300px] overflow-y-auto custom-scrollbar">
 {isScanning ? (
 <div className="flex items-center justify-center h-full text-gray-500 text-gray-500 text-sm">
 <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
 </svg>
 Scanning...
 </div>
 ) : scanResult ? (
 <div className="space-y-3">
 {/* Derive visual state: red (positive), amber (matches but below threshold), green (no matches) */}
 {(() => {
 const isBelowThreshold = !scanResult.isPositive && scanResult.matchedRules.length > 0;
 const statusColor = scanResult.isPositive ? 'red' : isBelowThreshold ? 'amber' : 'green';
 const dotClass = statusColor === 'red'
 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
 : statusColor === 'amber'
 ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
 : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]';
 const textClass = statusColor === 'red'
 ? 'text-red-400'
 : statusColor === 'amber'
 ? 'text-yellow-400'
 : 'text-green-400';
 const barClass = statusColor === 'red'
 ? 'bg-red-500'
 : statusColor === 'amber'
 ? 'bg-yellow-500'
 : 'bg-green-500';
 const statusLabel = statusColor === 'red'
 ? 'INJECTION DETECTED'
 : statusColor === 'amber'
 ? 'BELOW THRESHOLD'
 : 'NO THREAT DETECTED';

 return (
 <>
 {/* Status Indicator */}
 <div className="flex items-center gap-3">
 <div className={`w-4 h-4 rounded-full ${dotClass}`} />
 <span className={`font-semibold text-lg ${textClass}`}>
 {statusLabel}
 </span>
 </div>

 {/* Confidence */}
 <div className="flex items-center gap-2 text-sm">
 <span className="text-gray-500">Confidence:</span>
 <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden max-w-[200px]">
 <div
 className={`h-full transition-all duration-300 ${barClass}`}
 style={{ width: `${scanResult.confidence}%` }}
 />
 </div>
 <span className={`font-mono ${textClass}`}>
 {scanResult.confidence}%
 </span>
 </div>

 {/* Matched Rules Count */}
 {(scanResult.isPositive || isBelowThreshold) && (
 <div className={`text-sm ${isBelowThreshold ? 'text-yellow-400/80' : 'text-gray-400 text-gray-400'}`}>
 {scanResult.matchedRules.length} rule{scanResult.matchedRules.length !== 1 ? 's' : ''} triggered
 {isBelowThreshold && ' - BELOW THRESHOLD'}
 </div>
 )}
 </>
 );
 })()}

 {/* Reasons with per-rule impact */}
 <div className="space-y-1">
 <span className="text-gray-500 text-gray-500 text-sm">Analysis:</span>
 <ul className="space-y-1.5">
 {scanResult.isPositive ? (
 scanResult.matchedRules
 .slice()
 .sort((a, b) => {
 const order = { critical: 0, high: 1, medium: 2, low: 3 };
 return order[a.severity] - order[b.severity];
 })
 .map((match) => {
 const impactColor =
 match.severity === 'critical' ? 'text-red-400 bg-red-900/30' :
 match.severity === 'high' ? 'text-orange-400 bg-orange-900/30' :
 match.severity === 'medium' ? 'text-yellow-400 bg-yellow-900/30' :
 'text-green-400 bg-green-900/30';
 const severityLabel =
 match.severity === 'critical' ? '\u{1f534} CRITICAL' :
 match.severity === 'high' ? '\u{1f7e0} HIGH' :
 match.severity === 'medium' ? '\u{1f7e1} MEDIUM' :
 '\u{1f7e2} LOW';
 let detail = '';
 if (match.details) {
 detail = `: ${match.details}`;
 } else if (match.matches.length > 0) {
 const displayMatches = match.matches.slice(0, 3);
 const matchText = displayMatches.map(m => `"${m.slice(0, 40)}${m.length > 40 ? '...' : ''}"`).join(', ');
 detail = `: Found ${matchText}`;
 if (match.matches.length > 3) {
 detail += ` (+${match.matches.length - 3} more)`;
 }
 }
 return (
 <li
 key={match.ruleId}
 className={`flex items-start gap-2 text-sm text-gray-300 ${
 onRuleClick ? 'cursor-pointer hover:bg-gray-800/50 rounded px-2 py-1 -mx-2 transition-colors' : ''
 }`}
 onClick={() => onRuleClick?.(match)}
 title={onRuleClick ? 'Click to view rule details' : undefined}
 >
 <span className="text-[#c9a227] mt-0.5 flex-shrink-0">&rsaquo;</span>
 <span className="break-words flex-1">
 [{severityLabel}] {match.ruleName}{detail}
 </span>
 {match.confidenceImpact != null && (
 <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-mono rounded ${impactColor}`}>
 +{match.confidenceImpact}pts
 </span>
 )}
 </li>
 );
 })
 ) : (
 scanResult.reasons.map((reason, idx) => (
 <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
 <span className="text-[#c9a227] mt-0.5 flex-shrink-0">&rsaquo;</span>
 <span className="break-words">{reason}</span>
 </li>
 ))
 )}
 </ul>
 </div>

 {/* Compound Threats */}
 {scanResult.compoundThreats && scanResult.compoundThreats.length > 0 && (
 <div className="mt-3 p-3 bg-red-900/20 border border-red-900/40 rounded-lg">
 <div className="flex items-center gap-2 mb-2">
 <span className="text-red-400 font-semibold text-sm">Compound Threats Detected</span>
 <span className="px-1.5 py-0.5 text-[10px] bg-red-900/50 text-red-300 rounded-full font-medium">
 {scanResult.compoundThreats.length}
 </span>
 </div>
 <div className="space-y-2">
 {scanResult.compoundThreats.map((threat) => (
 <div key={threat.id} className="text-xs">
 <div className="flex items-center gap-1.5">
 <span className={`px-1 py-0.5 text-[10px] rounded ${
 threat.severity === 'critical' ? 'text-red-400 bg-red-900/30' : 'text-orange-400 bg-orange-900/30'
 }`}>
 {threat.severity}
 </span>
 <span className="text-gray-200 font-medium">{threat.name}</span>
 </div>
 <p className="text-gray-500 mt-0.5 ml-0.5">{threat.description}</p>
 <div className="flex flex-wrap gap-1 mt-1 ml-0.5">
 {threat.triggeredCategories.map(cat => (
 <span key={cat} className="px-1 py-0.5 text-[9px] bg-gray-800 text-gray-400 rounded">
 {cat}
 </span>
 ))}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Timestamp */}
 <div className="text-xs text-gray-600 text-gray-600 font-mono pt-2 border-t border-gray-800 border-gray-800">
 Scanned at {scanResult.timestamp.toLocaleTimeString()}
 </div>
 </div>
 ) : (
 <div className="flex items-center justify-center h-full text-gray-600 text-gray-600 text-sm">
 {promptText.trim()
 ? 'Scan will begin automatically...'
 : 'Enter a prompt or select one from the test battery →'
 }
 </div>
 )}
 </div>
 )}
 </div>
 );
}
