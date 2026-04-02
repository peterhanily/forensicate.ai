import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import type { ScanResult, RuleMatch } from '@forensicate/scanner';
import { computeAttackComplexity, type AttackComplexityScore } from '@forensicate/scanner';
import { exportReport, type ExportFormat } from '../lib/exportReport';
import { generateVaccine, type VaccineReport } from '../lib/vaccineGenerator';
import { useToast } from './Toast';

// --- Radar Chart for Attack Complexity Score ---
function RadarChart({ score }: { score: AttackComplexityScore }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const axes = [
    { key: 'sophistication', label: 'Sophistication', short: 'SOPH', value: score.sophistication },
    { key: 'blastRadius', label: 'Blast Radius', short: 'BLAST', value: score.blastRadius },
    { key: 'reversibility', label: 'Irreversibility', short: 'IRREV', value: score.reversibility },
    { key: 'stealth', label: 'Stealth', short: 'STLTH', value: score.stealth },
  ];
  const n = axes.length;

  function point(i: number, val: number): [number, number] {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const dist = (val / 100) * r;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  }

  const gridLevels = [25, 50, 75, 100];
  const dataPoints = axes.map((a, i) => point(i, a.value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';

  const labelColor = (val: number) =>
    val >= 70 ? '#ef4444' : val >= 40 ? '#eab308' : '#22c55e';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Attack Complexity Score radar chart: Sophistication ${score.sophistication}, Blast Radius ${score.blastRadius}, Stealth ${score.stealth}, Irreversibility ${score.reversibility}, Overall ${score.overall} out of 100`}>
        <title>Attack Complexity Score: {score.overall}/100 ({score.label})</title>
        {/* Grid rings */}
        {gridLevels.map(level => {
          const pts = Array.from({ length: n }, (_, i) => point(i, level));
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
          return <path key={level} d={path} fill="none" stroke="#374151" strokeWidth={0.5} opacity={0.6} />;
        })}
        {/* Axis lines */}
        {axes.map((_, i) => {
          const [px, py] = point(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke="#374151" strokeWidth={0.5} opacity={0.4} />;
        })}
        {/* Data polygon */}
        <path d={dataPath} fill="rgba(201, 162, 39, 0.15)" stroke="#c9a227" strokeWidth={1.5} />
        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="#c9a227" />
        ))}
        {/* Axis labels */}
        {axes.map((a, i) => {
          const [lx, ly] = point(i, 120);
          return (
            <text key={a.key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={labelColor(a.value)} fontSize={8} fontFamily="monospace" fontWeight={600}>
              {a.short}
            </text>
          );
        })}
      </svg>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-mono font-bold ${
          score.overall >= 70 ? 'text-red-400' : score.overall >= 40 ? 'text-yellow-400' : 'text-green-400'
        }`}>
          ACS: {score.overall}/100
        </span>
        <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${
          score.label === 'expert' ? 'bg-red-900/40 text-red-400' :
          score.label === 'advanced' ? 'bg-orange-900/40 text-orange-400' :
          score.label === 'intermediate' ? 'bg-yellow-900/40 text-yellow-400' :
          score.label === 'basic' ? 'bg-blue-900/40 text-blue-400' :
          'bg-green-900/40 text-green-400'
        }`}>
          {score.label.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// --- Vaccine Modal ---
function VaccineModal({ vaccine, onClose }: { vaccine: VaccineReport; onClose: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and Escape key
  useEffect(() => {
    const el = modalRef.current;
    if (el) el.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && el) {
        const focusable = el.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"]), a[href], input, select, textarea');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(vaccine.systemPromptPatch).then(() => {
      setCopied(true);
      toast('Vaccine copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast('Failed to copy — try selecting and copying manually', 'error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose} role="dialog" aria-modal="true" aria-label="Prompt Vaccine">
      <div ref={modalRef} tabIndex={-1} className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl focus:outline-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-sm font-semibold text-gray-200">Prompt Vaccine</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors" aria-label="Close vaccine modal">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-gray-400">{vaccine.summary}</p>

          {/* Grouped clauses */}
          {(() => {
            const grouped = new Map<string, typeof vaccine.clauses>();
            for (const c of vaccine.clauses) {
              const list = grouped.get(c.category) ?? [];
              list.push(c);
              grouped.set(c.category, list);
            }
            return [...grouped.entries()].map(([category, clauses]) => (
              <div key={category} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-800/50 px-3 py-1.5 text-xs font-semibold text-[#c9a227]">{category}</div>
                <div className="p-3 space-y-2">
                  {clauses.map(c => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      <span className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                        c.severity === 'critical' ? 'bg-red-500' :
                        c.severity === 'high' ? 'bg-orange-500' :
                        c.severity === 'medium' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`} />
                      <span className="text-gray-300">{c.instruction}</span>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}

          {/* Raw output */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 font-mono uppercase">System Prompt Patch</span>
              <button
                onClick={handleCopy}
                className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1"
              >
                {copied ? (
                  <>
                    <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-[11px] text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-[200px] overflow-y-auto">
              {vaccine.systemPromptPatch}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ScannerResultsProps {
 scanResult: ScanResult | null;
 promptText: string;
 isScanning: boolean;
 onRuleClick?: (match: RuleMatch) => void;
 isExpanded?: boolean;
 onToggle?: () => void;
}

function ScannerResults({
 scanResult,
 promptText,
 isScanning,
 onRuleClick,
 isExpanded = true,
 onToggle,
}: ScannerResultsProps) {
 const { toast } = useToast();
 const [showExportMenu, setShowExportMenu] = useState(false);
 const [showVaccine, setShowVaccine] = useState(false);
 const exportRef = useRef<HTMLDivElement>(null);
 const mountedRef = useRef(true);
 useEffect(() => { return () => { mountedRef.current = false; }; }, []);

 const attackComplexity = useMemo(() => {
   if (!scanResult || scanResult.matchedRules.length === 0) return null;
   return computeAttackComplexity(scanResult.matchedRules, scanResult.compoundThreats);
 }, [scanResult]);

 const vaccine = useMemo(() => {
   if (!scanResult || scanResult.matchedRules.length === 0) return null;
   return generateVaccine(scanResult.matchedRules);
 }, [scanResult]);

 const closeExportMenu = useCallback((e: MouseEvent) => {
   if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
     setTimeout(() => { if (mountedRef.current) setShowExportMenu(false); }, 0);
   }
 }, []);

 useEffect(() => {
   if (showExportMenu) {
     document.addEventListener('mousedown', closeExportMenu);
     return () => document.removeEventListener('mousedown', closeExportMenu);
   }
 }, [showExportMenu, closeExportMenu]);

 function handleExport(format: ExportFormat) {
   if (scanResult) {
     exportReport(format, scanResult, promptText);
     setShowExportMenu(false);
     toast(`Report exported as ${format.toUpperCase()}`, 'success');
   }
 }

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
 <div className="flex items-center gap-2">
 {scanResult && scanResult.isPositive && (
   <button
     onClick={(e) => { e.stopPropagation(); window.location.href = `${import.meta.env.BASE_URL}mutate?text=${encodeURIComponent(promptText)}`; }}
     className="px-2 py-0.5 text-[10px] bg-[#5c0000] hover:bg-[#700000] text-[#c9a227] border border-[#8b0000] rounded transition-colors flex items-center gap-1"
     title="Test defenses by mutating this injection"
     aria-label="Test defenses in Mutation Engine"
   >
     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
     </svg>
     Test Defenses
   </button>
 )}
 {vaccine && vaccine.clauses.length > 0 && (
   <button
     onClick={(e) => { e.stopPropagation(); setShowVaccine(true); }}
     className="px-2 py-0.5 text-[10px] bg-[#0a3000] hover:bg-[#0d4000] text-green-400 border border-green-900 rounded transition-colors flex items-center gap-1"
     title="Generate defensive system prompt clauses"
     aria-label="Generate prompt vaccine"
   >
     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
     </svg>
     Vaccine
   </button>
 )}
 {scanResult && scanResult.matchedRules.length > 0 && (
 <div ref={exportRef} className="relative">
   <button
     onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
     className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1"
     title="Export scan report"
     aria-label="Export scan report"
   >
     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
     </svg>
     Export
   </button>
   {showExportMenu && (
     <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px] py-1">
       {([
         ['html', 'HTML Report'],
         ['json', 'JSON'],
         ['csv', 'CSV'],
         ['sarif', 'SARIF'],
       ] as [ExportFormat, string][]).map(([format, label]) => (
         <button
           key={format}
           onClick={(e) => { e.stopPropagation(); handleExport(format); }}
           className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
         >
           {label}
         </button>
       ))}
     </div>
   )}
 </div>
 )}
 {scanResult && (
 <span className="text-gray-500 text-gray-500 text-xs font-mono">
 {scanResult.totalRulesChecked} rules checked
 </span>
 )}
 </div>
 </>
 );

 return (
 <>
 <div className="border border-gray-800 border-gray-800 rounded-lg bg-gray-900/50 bg-gray-900/50 overflow-hidden">
 {onToggle ? (
 <button
 onClick={onToggle}
 aria-expanded={isExpanded}
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
 <div className="p-4 min-h-[180px] max-h-[300px] overflow-y-auto custom-scrollbar" aria-live="polite" role="status">
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
 <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden max-w-[200px]" role="progressbar" aria-valuenow={scanResult.confidence} aria-valuemin={0} aria-valuemax={100} aria-label={`Scan confidence: ${scanResult.confidence}%`}>
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
 <span>[{severityLabel}] {match.ruleName}{detail}</span>
 {(match.killChain || match.mitreAtlas || match.euAiActRisk) && (
   <span className="flex flex-wrap gap-1 mt-0.5">
     {match.killChain?.map(stage => (
       <span key={stage} className="px-1 py-0 text-[9px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50 rounded">{stage}</span>
     ))}
     {match.mitreAtlas?.map(id => (
       <span key={id} className="px-1 py-0 text-[9px] font-mono bg-blue-900/30 text-blue-400 border border-blue-800/50 rounded">{id}</span>
     ))}
     {match.euAiActRisk && (
       <span className={`px-1 py-0 text-[9px] font-mono rounded border ${
         match.euAiActRisk === 'high' ? 'bg-red-900/30 text-red-400 border-red-800/50'
         : match.euAiActRisk === 'limited' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50'
         : 'bg-gray-800 text-gray-400 border-gray-700'
       }`}>EU:{match.euAiActRisk}</span>
     )}
   </span>
 )}
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

 {/* Attack Complexity Score */}
 {attackComplexity && (
 <div className="mt-3 p-3 bg-gray-800/30 border border-gray-800 rounded-lg">
   <div className="flex items-center gap-2 mb-2">
     <span className="text-gray-400 font-semibold text-sm">Attack Complexity Score</span>
   </div>
   <div className="flex items-center gap-4 flex-wrap">
     <RadarChart score={attackComplexity} />
     <div className="flex-1 min-w-[140px] space-y-1.5">
       {[
         { label: 'Sophistication', value: attackComplexity.sophistication },
         { label: 'Blast Radius', value: attackComplexity.blastRadius },
         { label: 'Stealth', value: attackComplexity.stealth },
         { label: 'Irreversibility', value: attackComplexity.reversibility },
       ].map(axis => (
         <div key={axis.label} className="flex items-center gap-2">
           <span className="text-[10px] text-gray-500 w-[80px] flex-shrink-0 font-mono">{axis.label}</span>
           <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
             <div
               className={`h-full rounded-full transition-all duration-300 ${
                 axis.value >= 70 ? 'bg-red-500' : axis.value >= 40 ? 'bg-yellow-500' : 'bg-green-500'
               }`}
               style={{ width: `${axis.value}%` }}
             />
           </div>
           <span className={`text-[10px] font-mono w-[28px] text-right ${
             axis.value >= 70 ? 'text-red-400' : axis.value >= 40 ? 'text-yellow-400' : 'text-green-400'
           }`}>{axis.value}</span>
         </div>
       ))}
     </div>
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
 {showVaccine && vaccine && (
   <VaccineModal vaccine={vaccine} onClose={() => setShowVaccine(false)} />
 )}
 </>
 );
}

export default memo(ScannerResults);
