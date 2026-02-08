import { useEffect } from 'react';
import type { DetectionRule, RuleMatch } from '@forensicate/scanner';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface RuleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: DetectionRule;
  match?: RuleMatch; // Optional - shows match-specific details
}

export default function RuleDetailsModal({
  isOpen,
  onClose,
  rule,
  match,
}: RuleDetailsModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen);
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-400 bg-red-900/30 border-red-900/50';
      case 'high': return 'text-orange-400 bg-orange-900/30 border-orange-900/50';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30 border-yellow-900/50';
      case 'low': return 'text-green-400 bg-green-900/30 border-green-900/50';
      default: return 'text-gray-400 bg-gray-900/30 border-gray-900/50';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'keyword': return '🔤';
      case 'regex': return '⚡';
      case 'heuristic': return '🧠';
      case 'encoding': return '🔐';
      case 'structural': return '🏗️';
      default: return '•';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-gray-900 border-2 border-[#c9a227] rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gray-800/50 border-b border-gray-700 flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{getSeverityIcon(rule.severity)}</span>
              <h2 className="text-xl font-semibold text-[#c9a227]">
                {rule.name}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 text-xs font-semibold uppercase rounded border ${getSeverityColor(rule.severity)}`}>
                {rule.severity}
              </span>
              <span className="px-3 py-1 text-xs font-medium bg-gray-800 text-gray-300 rounded border border-gray-700">
                {getTypeIcon(rule.type)} {rule.type}
              </span>
              {rule.weight && (
                <span className="px-3 py-1 text-xs font-medium bg-[#c9a227]/20 text-[#c9a227] rounded border border-[#c9a227]/30">
                  Weight: {rule.weight}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-800"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-gray-300 leading-relaxed">
              {rule.description}
            </p>
          </div>

          {/* Match Details (if provided) */}
          {match && (
            <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Match Details
              </h3>
              <div className="space-y-2">
                {match.confidenceImpact != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Confidence Impact:</span>
                    <span className="text-[#c9a227] font-mono font-semibold">+{match.confidenceImpact} points</span>
                  </div>
                )}
                {match.matches && match.matches.length > 0 && (
                  <div>
                    <div className="text-gray-400 text-sm mb-2">Matched Text:</div>
                    <div className="space-y-1">
                      {match.matches.slice(0, 10).map((text, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 bg-gray-900/50 border border-gray-700 rounded font-mono text-sm text-gray-300 break-all"
                        >
                          "{text}"
                        </div>
                      ))}
                      {match.matches.length > 10 && (
                        <div className="text-gray-500 text-xs italic">
                          ... and {match.matches.length - 10} more matches
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {match.matchPositions && match.matchPositions.length > 0 && (
                  <div>
                    <div className="text-gray-400 text-sm mb-2">Positions:</div>
                    <div className="space-y-1">
                      {match.matchPositions.slice(0, 5).map((pos, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 bg-gray-900/50 border border-gray-700 rounded font-mono text-xs text-gray-400"
                        >
                          Line {pos.line}, Col {pos.column}: "{pos.text}" (index {pos.start}-{pos.end})
                        </div>
                      ))}
                      {match.matchPositions.length > 5 && (
                        <div className="text-gray-500 text-xs italic">
                          ... and {match.matchPositions.length - 5} more positions
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {match.details && (
                  <div>
                    <div className="text-gray-400 text-sm mb-2">Additional Details:</div>
                    <div className="px-3 py-2 bg-gray-900/50 border border-gray-700 rounded text-sm text-gray-300">
                      {match.details}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rule Logic */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Detection Logic
            </h3>
            {rule.keywords && rule.keywords.length > 0 && (
              <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">
                  Keywords ({rule.keywords.length}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {rule.keywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-gray-900/50 border border-gray-700 rounded text-xs font-mono text-gray-300"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {rule.pattern && (
              <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">
                  Regular Expression:
                </div>
                <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded font-mono text-sm text-green-400 overflow-x-auto">
                  /{rule.pattern}/{rule.flags || 'gi'}
                </div>
              </div>
            )}
            {rule.heuristic && (
              <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-2">
                  Heuristic Function:
                </div>
                <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded font-mono text-xs text-gray-400">
                  {rule.heuristic.toString().slice(0, 500)}
                  {rule.heuristic.toString().length > 500 && '...'}
                </div>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="border-t border-gray-800 pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Rule ID:</span>
                <span className="ml-2 font-mono text-gray-400">{rule.id}</span>
              </div>
              <div>
                <span className="text-gray-500">Status:</span>
                <span className={`ml-2 font-semibold ${rule.enabled ? 'text-green-400' : 'text-red-400'}`}>
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-800/30 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#c9a227] hover:bg-[#d4af37] text-gray-900 font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
