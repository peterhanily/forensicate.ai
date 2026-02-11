import { useState, useMemo } from 'react';
import type { ScanResult, MatchPosition, RuleMatch, AnnotatedSegment } from '@forensicate/scanner';
import AnnotationPopover from './AnnotationPopover';
import OverviewMap from './OverviewMap';

interface AnnotatedPromptProps {
 text: string;
 scanResult: ScanResult | null;
 onSegmentClick?: (segment: AnnotatedSegment) => void;
 onRuleClick?: (match: RuleMatch) => void;
}

export default function AnnotatedPrompt({
 text,
 scanResult,
 onSegmentClick,
 onRuleClick,
}: AnnotatedPromptProps) {
 const [hoveredSegment, setHoveredSegment] = useState<AnnotatedSegment | null>(null);
 const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });

 // Merge overlapping match positions into segments
 const segments = useMemo(() => {
 if (!scanResult?.matchedRules) return [];

 // Collect all positions with their rules
 const allPositions: Array<{ pos: MatchPosition; rule: RuleMatch }> = [];

 scanResult.matchedRules.forEach(rule => {
 if (rule.matchPositions && rule.matchPositions.length > 0) {
 rule.matchPositions.forEach(pos => {
 allPositions.push({ pos, rule });
 });
 }
 });

 // No positions to annotate
 if (allPositions.length === 0) return [];

 // Sort by start position
 allPositions.sort((a, b) => a.pos.start - b.pos.start);

 // Merge overlapping ranges
 const merged: AnnotatedSegment[] = [];

 allPositions.forEach(({ pos, rule }) => {
 const overlapping = merged.find(
 seg => pos.start < seg.end && pos.end > seg.start
 );

 if (overlapping) {
 // Extend the segment and add the rule
 overlapping.start = Math.min(overlapping.start, pos.start);
 overlapping.end = Math.max(overlapping.end, pos.end);
 overlapping.text = text.substring(overlapping.start, overlapping.end);
 if (!overlapping.rules.find(r => r.ruleId === rule.ruleId)) {
 overlapping.rules.push(rule);
 }
 } else {
 // Create new segment
 merged.push({
 start: pos.start,
 end: pos.end,
 text: pos.text,
 rules: [rule],
 });
 }
 });

 return merged;
 }, [text, scanResult]);

 // Render text with annotations
 const renderAnnotatedText = () => {
 if (segments.length === 0) {
 return <span className="text-gray-300">{text}</span>;
 }

 const elements: React.ReactElement[] = [];
 let lastIndex = 0;

 segments.forEach((segment, idx) => {
 // Add unannotated text before this segment
 if (segment.start > lastIndex) {
 elements.push(
 <span key={`text-${lastIndex}`} className="text-gray-300">
 {text.substring(lastIndex, segment.start)}
 </span>
 );
 }

 // Get highest severity for coloring
 const severities = segment.rules.map(r => r.severity);
 const hasCritical = severities.includes('critical');
 const hasHigh = severities.includes('high');
 const hasMedium = severities.includes('medium');

 const severityClass = hasCritical
 ? 'annotation-critical'
 : hasHigh
 ? 'annotation-high'
 : hasMedium
 ? 'annotation-medium'
 : 'annotation-low';

 // Multiple rules = thicker underline
 const underlineClass = segment.rules.length > 1
 ? 'underline-thick'
 : 'underline-normal';

 elements.push(
 <span
 key={`segment-${idx}`}
 className={`annotated-text ${severityClass} ${underlineClass} cursor-pointer transition-colors`}
 onMouseEnter={(e) => {
 setHoveredSegment(segment);
 const rect = e.currentTarget.getBoundingClientRect();
 setPopoverPosition({
 x: rect.left + rect.width / 2,
 y: rect.bottom + 8,
 });
 }}
 onMouseLeave={() => setHoveredSegment(null)}
 onClick={() => onSegmentClick?.(segment)}
 >
 {segment.text}
 </span>
 );

 lastIndex = segment.end;
 });

 // Add remaining text
 if (lastIndex < text.length) {
 elements.push(
 <span key={`text-${lastIndex}`} className="text-gray-300">
 {text.substring(lastIndex)}
 </span>
 );
 }

 return elements;
 };

 // Show message if no annotations available
 if (!scanResult || segments.length === 0) {
 return (
 <div className="border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden">
 <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
 <span className="text-gray-400 text-xs font-mono">annotated_view</span>
 <span className="text-gray-500 text-xs">
 {segments.length === 0 ? 'No matches to annotate' : 'No scan result'}
 </span>
 </div>
 <div className="p-4 text-center text-gray-500 text-sm">
 {!scanResult
 ? 'Run a scan to see annotated results'
 : 'No matches found in this prompt'
 }
 </div>
 </div>
 );
 }

 return (
 <div className="border border-gray-800 rounded-lg bg-gray-900/30 overflow-hidden">
 {/* Header */}
 <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700 flex items-center justify-between">
 <span className="text-gray-400 text-xs font-mono">annotated_view</span>
 <span className="text-gray-500 text-xs">
 {segments.length} {segments.length === 1 ? 'segment' : 'segments'} highlighted
 </span>
 </div>

 {/* Annotated Text Display */}
 <div className="relative">
 <div className="p-4 bg-gray-900/50 font-mono text-sm whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar">
 {renderAnnotatedText()}
 </div>

 {/* Overview Map */}
 <OverviewMap text={text} segments={segments} />
 </div>

 {/* Legend */}
 <div className="px-3 py-2 bg-gray-800/30 border-t border-gray-700 flex flex-wrap items-center gap-3 text-xs">
 <span className="text-gray-500">Legend:</span>
 <div className="flex items-center gap-1">
 <div className="w-3 h-0.5 bg-red-500" />
 <span className="text-gray-400">Critical</span>
 </div>
 <div className="flex items-center gap-1">
 <div className="w-3 h-0.5 bg-orange-500" />
 <span className="text-gray-400">High</span>
 </div>
 <div className="flex items-center gap-1">
 <div className="w-3 h-0.5 bg-yellow-500" />
 <span className="text-gray-400">Medium</span>
 </div>
 <div className="flex items-center gap-1">
 <div className="w-3 h-0.5 bg-blue-500" />
 <span className="text-gray-400">Low</span>
 </div>
 <span className="text-gray-600 ml-auto">Hover for details</span>
 </div>

 {/* Hover Popover */}
 {hoveredSegment && (
 <AnnotationPopover
 segment={hoveredSegment}
 position={popoverPosition}
 onRuleClick={onRuleClick}
 />
 )}
 </div>
 );
}
