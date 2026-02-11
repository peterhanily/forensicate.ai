import { createPortal } from 'react-dom';
import type { AnnotatedSegment, RuleMatch } from '@forensicate/scanner';

interface AnnotationPopoverProps {
 segment: AnnotatedSegment;
 position: { x: number; y: number };
 onRuleClick?: (match: RuleMatch) => void;
}

export default function AnnotationPopover({
 segment,
 position,
 onRuleClick,
}: AnnotationPopoverProps) {
 const getSeverityIcon = (severity: string) => {
 switch (severity) {
 case 'critical': return '🔴';
 case 'high': return '🟠';
 case 'medium': return '🟡';
 case 'low': return '🟢';
 default: return '⚪';
 }
 };

 const getSeverityLabel = (severity: string) => {
 return severity.charAt(0).toUpperCase() + severity.slice(1);
 };

 const getSeverityColor = (severity: string) => {
 switch (severity) {
 case 'critical': return 'text-red-400';
 case 'high': return 'text-orange-400';
 case 'medium': return 'text-yellow-400';
 case 'low': return 'text-green-400';
 default: return 'text-gray-400';
 }
 };

 const getTypeLabel = (type: string) => {
 switch (type) {
 case 'keyword': return 'Keyword';
 case 'regex': return 'Regex';
 case 'heuristic': return 'Heuristic';
 case 'encoding': return 'Encoding';
 case 'structural': return 'Structural';
 default: return type;
 }
 };

 // Sort rules by severity (critical first)
 const sortedRules = [...segment.rules].sort((a, b) => {
 const order = { critical: 0, high: 1, medium: 2, low: 3 };
 return order[a.severity] - order[b.severity];
 });

 return createPortal(
 <div
 className="fixed z-[100] pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200"
 style={{
 left: `${position.x}px`,
 top: `${position.y}px`,
 transform: 'translateX(-50%)',
 }}
 >
 <div className="bg-gray-900 border-2 border-[#c9a227] rounded-lg shadow-2xl shadow-[#c9a227]/20 min-w-[320px] max-w-[420px] pointer-events-auto">
 {/* Arrow pointing up */}
 <div
 className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-gray-900 border-t-2 border-l-2 border-[#c9a227] transform rotate-45"
 />

 {/* Header */}
 <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700 rounded-t-lg">
 <div className="flex items-center gap-2 mb-2">
 <span className="text-[#c9a227] font-semibold text-sm">
 {sortedRules.length} {sortedRules.length === 1 ? 'Rule' : 'Rules'} Triggered
 </span>
 </div>
 <div className="text-xs text-gray-400 font-mono break-all bg-gray-900/50 px-2 py-1.5 rounded border border-gray-800">
 "{segment.text.length > 60 ? segment.text.slice(0, 57) + '...' : segment.text}"
 </div>
 </div>

 {/* Rules List */}
 <div className="px-4 py-3 space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar">
 {sortedRules.map((rule, idx) => (
 <div
 key={rule.ruleId}
 className={`${idx > 0 ? 'pt-3 border-t border-gray-800' : ''} ${
 onRuleClick ? 'cursor-pointer hover:bg-gray-800/30 -mx-2 px-2 py-1 rounded transition-colors' : ''
 }`}
 onClick={(e) => {
 if (onRuleClick) {
 e.stopPropagation();
 onRuleClick(rule);
 }
 }}
 title={onRuleClick ? 'Click to view full rule details' : undefined}
 >
 <div className="flex items-start gap-2 mb-1.5">
 <span className="text-lg flex-shrink-0">{getSeverityIcon(rule.severity)}</span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <span className={`text-xs font-semibold uppercase ${getSeverityColor(rule.severity)}`}>
 {getSeverityLabel(rule.severity)}
 </span>
 <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
 {getTypeLabel(rule.ruleType)}
 </span>
 </div>
 <div className="text-sm text-gray-200 font-medium">
 {rule.ruleName}
 </div>
 {rule.confidenceImpact != null && (
 <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
 <span>Impact:</span>
 <span className="text-[#c9a227] font-mono font-semibold">
 +{rule.confidenceImpact}pts
 </span>
 </div>
 )}
 {rule.details && (
 <div className="text-xs text-gray-500 mt-1 italic">
 {rule.details}
 </div>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>

 {/* Footer */}
 <div className="px-4 py-2 bg-gray-800/30 border-t border-gray-700 text-xs text-gray-500 text-center rounded-b-lg">
 {onRuleClick ? 'Click any rule to view full details' : 'Hover over annotated text to see details'}
 </div>
 </div>
 </div>,
 document.body
 );
}
