import { useState } from 'react';
import type { ScanResult } from '@forensicate/scanner';

// ============================================================================
// Scan History Types
// ============================================================================

export interface ScanHistoryEntry {
 id: string;
 promptSnippet: string;
 fullPrompt: string;
 confidence: number;
 isPositive: boolean;
 matchedRuleCount: number;
 timestamp: Date;
 result: ScanResult;
}

// ============================================================================
// Scan History Component
// ============================================================================

interface ScanHistoryProps {
 entries: ScanHistoryEntry[];
 onSelectEntry: (entry: ScanHistoryEntry) => void;
 onClear: () => void;
}

export default function ScanHistory({
 entries,
 onSelectEntry,
 onClear,
}: ScanHistoryProps) {
 const [isCollapsed, setIsCollapsed] = useState(true);

 if (entries.length === 0) return null;

 return (
 <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
 <button
 onClick={() => setIsCollapsed(!isCollapsed)}
 className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700 hover:bg-gray-800/70 transition-colors"
 >
 <div className="flex items-center gap-2">
 <span className="text-gray-400 text-xs font-mono">scan_history</span>
 <span className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded-full font-medium">
 {entries.length}
 </span>
 </div>
 <div className="flex items-center gap-2">
 <svg
 className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
 fill="none"
 stroke="currentColor"
 viewBox="0 0 24 24"
 >
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
 </svg>
 </div>
 </button>

 {!isCollapsed && (
 <>
 <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
 {entries.map((entry) => (
 <button
 key={entry.id}
 onClick={() => onSelectEntry(entry)}
 className="w-full text-left px-3 py-2 border-b border-gray-800/50 last:border-b-0 hover:bg-gray-800/30 transition-colors group"
 >
 <div className="flex items-center gap-2">
 <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
 entry.isPositive
 ? 'bg-red-500'
 : 'bg-green-500'
 }`} />
 <span className="text-gray-300 text-xs truncate flex-1 font-mono">
 {entry.promptSnippet}
 </span>
 <span className={`text-[10px] font-mono flex-shrink-0 ${
 entry.isPositive ? 'text-red-400' : 'text-green-400'
 }`}>
 {entry.confidence}%
 </span>
 </div>
 <div className="flex items-center gap-2 mt-1 ml-4">
 {entry.isPositive && (
 <span className="text-[10px] text-gray-500">
 {entry.matchedRuleCount} rule{entry.matchedRuleCount !== 1 ? 's' : ''}
 </span>
 )}
 <span className="text-[10px] text-gray-600 font-mono">
 {entry.timestamp.toLocaleTimeString()}
 </span>
 </div>
 </button>
 ))}
 </div>
 <div className="px-3 py-1.5 bg-gray-800/30 border-t border-gray-700 flex items-center justify-between">
 <span className="text-[10px] text-gray-600">
 {entries.length}/50 entries
 </span>
 <button
 onClick={(e) => { e.stopPropagation(); onClear(); }}
 className="text-[10px] text-gray-500 hover:text-gray-300 font-mono transition-colors"
 >
 clear history
 </button>
 </div>
 </>
 )}
 </div>
 );
}
