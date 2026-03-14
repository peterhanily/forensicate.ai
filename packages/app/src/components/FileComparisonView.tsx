import { useState } from 'react';
import type { FileExtractionResult, FileThreat, RuleSeverity } from '@forensicate/scanner';

interface FileComparisonViewProps {
  fileInfo: FileExtractionResult;
  fileThreats: FileThreat[];
}

function severityColor(severity: RuleSeverity): string {
  switch (severity) {
    case 'critical': return 'text-red-400 bg-red-900/30 border-red-800/50';
    case 'high': return 'text-orange-400 bg-orange-900/30 border-orange-800/50';
    case 'medium': return 'text-yellow-400 bg-yellow-900/30 border-yellow-800/50';
    case 'low': return 'text-green-400 bg-green-900/30 border-green-800/50';
  }
}

function severityBadge(severity: RuleSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-red-900/50 text-red-400';
    case 'high': return 'bg-orange-900/50 text-orange-400';
    case 'medium': return 'bg-yellow-900/50 text-yellow-400';
    case 'low': return 'bg-green-900/50 text-green-400';
  }
}

function threatTypeLabel(type: FileThreat['type']): string {
  switch (type) {
    case 'hidden-text': return 'Hidden Text';
    case 'metadata-injection': return 'Metadata Injection';
    case 'invisible-unicode': return 'Invisible Unicode';
    case 'low-contrast': return 'Low Contrast';
    case 'steganographic': return 'Steganographic';
    case 'off-page-content': return 'Off-Page Content';
    case 'tracked-change-injection': return 'Tracked Changes';
    case 'vanish-text-injection': return 'Vanish Text';
    case 'custom-xml-injection': return 'Custom XML';
    case 'html-hidden-injection': return 'Hidden HTML';
    case 'svg-hidden-injection': return 'Hidden SVG';
    case 'bidi-override': return 'Bidi Override';
  }
}

function layerTypeBadge(type: string): string {
  switch (type) {
    case 'tracked-change': return 'bg-amber-900/50 text-amber-400';
    case 'vanish-text': return 'bg-red-900/50 text-red-400';
    case 'comment': return 'bg-purple-900/50 text-purple-400';
    case 'custom-xml': return 'bg-orange-900/50 text-orange-400';
    case 'header-footer': return 'bg-blue-900/50 text-blue-400';
    case 'doc-property': return 'bg-cyan-900/50 text-cyan-400';
    case 'low-contrast': return 'bg-yellow-900/50 text-yellow-400';
    default: return 'bg-red-900/50 text-red-400';
  }
}

export default function FileComparisonView({ fileInfo, fileThreats }: FileComparisonViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hiddenLayers = fileInfo.layers.filter(l => l.type !== 'visible');
  const hasHiddenContent = hiddenLayers.length > 0;

  if (!hasHiddenContent && fileThreats.length === 0) return null;

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700 hover:bg-gray-800/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-red-400 text-xs font-mono font-semibold">file_analysis</span>
          {fileThreats.length > 0 && (
            <span className="bg-red-900/50 text-red-400 text-xs px-1.5 py-0.5 rounded font-mono">
              {fileThreats.length} threat{fileThreats.length !== 1 ? 's' : ''}
            </span>
          )}
          {hiddenLayers.length > 0 && (
            <span className="bg-yellow-900/50 text-yellow-400 text-xs px-1.5 py-0.5 rounded font-mono">
              {hiddenLayers.length} hidden layer{hiddenLayers.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs font-mono">
          {fileInfo.filename} · {fileInfo.extractionTimeMs.toFixed(0)}ms
        </span>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* File Threats */}
          {fileThreats.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-mono text-gray-400 uppercase tracking-wider">File-Specific Threats</h4>
              {fileThreats.map((threat, i) => (
                <div
                  key={i}
                  className={`border rounded px-3 py-2 ${severityColor(threat.severity)}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold ${severityBadge(threat.severity)}`}>
                      {threat.severity.toUpperCase()}
                    </span>
                    <span className="text-xs font-mono opacity-80">
                      {threatTypeLabel(threat.type)}
                    </span>
                    <span className="text-xs font-mono opacity-60 ml-auto">
                      {threat.location}
                    </span>
                  </div>
                  <p className="text-xs font-mono opacity-90">{threat.description}</p>
                  {threat.content && (
                    <pre className="mt-1 text-xs font-mono opacity-70 bg-black/20 rounded p-2 overflow-x-auto max-h-20">
                      {threat.content.slice(0, 200)}{threat.content.length > 200 ? '...' : ''}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Visible vs Hidden Comparison */}
          {hasHiddenContent && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Visible Content */}
              <div className="border border-gray-700 rounded bg-gray-900/30">
                <div className="px-3 py-1.5 bg-gray-800/50 border-b border-gray-700">
                  <span className="text-green-400 text-xs font-mono font-semibold">visible_content</span>
                  <span className="text-gray-600 text-xs font-mono ml-2">
                    {fileInfo.visibleText.length} chars
                  </span>
                </div>
                <pre className="p-3 text-xs font-mono text-green-400/80 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                  {fileInfo.visibleText.slice(0, 1000) || '(empty)'}
                  {fileInfo.visibleText.length > 1000 ? '\n...' : ''}
                </pre>
              </div>

              {/* Hidden Content */}
              <div className="border border-red-800/30 rounded bg-red-900/10">
                <div className="px-3 py-1.5 bg-red-900/20 border-b border-red-800/30">
                  <span className="text-red-400 text-xs font-mono font-semibold">hidden_content</span>
                  <span className="text-gray-600 text-xs font-mono ml-2">
                    {fileInfo.hiddenText.length} chars
                  </span>
                </div>
                <div className="p-3 space-y-2 overflow-auto max-h-48">
                  {hiddenLayers.map((layer, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-xs font-mono px-1 py-0.5 rounded ${layerTypeBadge(layer.type)}`}>
                          {layer.type}
                        </span>
                        <span className="text-gray-600 text-xs font-mono">
                          {layer.location}
                        </span>
                      </div>
                      <pre className="text-xs font-mono text-red-400/80 whitespace-pre-wrap break-words">
                        {layer.content.slice(0, 500)}
                        {layer.content.length > 500 ? '\n...' : ''}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Extraction Warnings */}
          {fileInfo.warnings.length > 0 && (
            <div className="text-xs font-mono text-yellow-500/70 space-y-0.5">
              {fileInfo.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
