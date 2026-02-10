/**
 * Red Team AI Panel - Adversarial Testing Interface
 */

import { useState } from 'react';
import type {
  RedTeamConfig,
  RedTeamRun,
  AttackTechnique,
  SuggestedRule,
} from '../lib/redteam';
import { RedTeamEngine } from '../lib/redteam';

export function RedTeamPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [lastRun, setLastRun] = useState<RedTeamRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration state
  const [config, setConfig] = useState<RedTeamConfig>({
    provider: 'local', // Default to local for demo
    model: 'mock',
    attacksPerRun: 10,
    techniques: [
      'paraphrasing',
      'encoding',
      'social-engineering',
      'hypothetical-framing',
      'context-manipulation',
    ],
    bypassThreshold: 50,
    minNovelty: 0.7,
  });

  const [showConfig, setShowConfig] = useState(false);

  /**
   * Run red team test
   */
  const handleRunTest = async () => {
    setIsRunning(true);
    setError(null);
    setProgress('Initializing red team engine...');

    try {
      const engine = new RedTeamEngine(config);

      setProgress('Generating adversarial attacks...');
      const result = await engine.runTest();

      setLastRun(result);
      setProgress('');
      setIsRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
      setProgress('');
    }
  };

  /**
   * Toggle technique selection
   */
  const toggleTechnique = (technique: AttackTechnique) => {
    setConfig((prev) => {
      const techniques = prev.techniques.includes(technique)
        ? prev.techniques.filter((t) => t !== technique)
        : [...prev.techniques, technique];
      return { ...prev, techniques };
    });
  };

  /**
   * Calculate vulnerability grade
   */
  const getVulnerabilityGrade = (
    bypassRate: number
  ): { grade: string; color: string; label: string } => {
    if (bypassRate < 10)
      return { grade: 'A', color: 'text-green-400', label: 'Excellent' };
    if (bypassRate < 25)
      return { grade: 'B', color: 'text-green-300', label: 'Good' };
    if (bypassRate < 50)
      return { grade: 'C', color: 'text-yellow-400', label: 'Fair' };
    if (bypassRate < 75)
      return { grade: 'D', color: 'text-orange-400', label: 'Poor' };
    return { grade: 'F', color: 'text-red-400', label: 'Critical' };
  };

  return (
    <div className="bg-black border border-gray-800 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-mono text-[#c9a227] mb-1">
            🔴 Red Team AI
          </h3>
          <p className="text-sm text-gray-400">
            Automated adversarial testing - discovers detection blind spots
          </p>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          {showConfig ? 'Hide Config' : 'Show Config'}
        </button>
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-mono text-[#c9a227] mb-3">
            Test Configuration
          </h4>

          {/* Provider Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Attack Generator
            </label>
            <select
              value={config.provider}
              onChange={(e) =>
                setConfig({
                  ...config,
                  provider: e.target.value as 'openai' | 'anthropic' | 'local',
                })
              }
              className="w-full bg-black border border-gray-700 text-white px-3 py-2 rounded text-sm font-mono"
            >
              <option value="local">Local (Demo Mode)</option>
              <option value="openai">OpenAI GPT-4</option>
              <option value="anthropic">Anthropic Claude</option>
            </select>
          </div>

          {/* API Key (if not local) */}
          {config.provider !== 'local' && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={(e) =>
                  setConfig({ ...config, apiKey: e.target.value })
                }
                placeholder="sk-..."
                className="w-full bg-black border border-gray-700 text-white px-3 py-2 rounded text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Stored locally, never sent to forensicate.ai servers
              </p>
            </div>
          )}

          {/* Attack Count */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Attacks Per Run: {config.attacksPerRun}
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={config.attacksPerRun}
              onChange={(e) =>
                setConfig({ ...config, attacksPerRun: parseInt(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>5 (quick)</span>
              <span>50 (thorough)</span>
            </div>
          </div>

          {/* Techniques */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Attack Techniques
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  'paraphrasing',
                  'encoding',
                  'social-engineering',
                  'hypothetical-framing',
                  'context-manipulation',
                  'role-confusion',
                  'translation',
                  'token-smuggling',
                  'multi-turn',
                  'compound',
                ] as AttackTechnique[]
              ).map((technique) => (
                <label
                  key={technique}
                  className="flex items-center space-x-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={config.techniques.includes(technique)}
                    onChange={() => toggleTechnique(technique)}
                    className="rounded"
                  />
                  <span className="text-gray-300">{technique}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Bypass Threshold */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Bypass Threshold: {config.bypassThreshold}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value={config.bypassThreshold}
              onChange={(e) =>
                setConfig({
                  ...config,
                  bypassThreshold: parseInt(e.target.value),
                })
              }
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Confidence below this = successful bypass
            </p>
          </div>
        </div>
      )}

      {/* Run Button */}
      <div>
        <button
          onClick={handleRunTest}
          disabled={isRunning || config.techniques.length === 0}
          className={`w-full py-3 px-4 rounded-lg font-mono text-sm transition-all ${
            isRunning || config.techniques.length === 0
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-[#c9a227] text-black hover:bg-[#d4b030] active:scale-95'
          }`}
        >
          {isRunning ? (
            <span className="flex items-center justify-center space-x-2">
              <span className="animate-spin">⚙️</span>
              <span>{progress || 'Running...'}</span>
            </span>
          ) : (
            '▶ Run Red Team Test'
          )}
        </button>

        {config.provider !== 'local' && !isRunning && (
          <p className="text-xs text-gray-500 mt-2 text-center">
            Estimated cost: $
            {((config.attacksPerRun * 500 * 2.5) / 1_000_000).toFixed(4)} (
            {config.attacksPerRun} attacks)
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-400 font-mono">Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {lastRun && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
            <h4 className="text-sm font-mono text-[#c9a227] mb-4">
              Test Results
            </h4>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-400">Total Attacks</div>
                <div className="text-2xl font-mono text-white">
                  {lastRun.totalAttacks}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Successful Bypasses</div>
                <div className="text-2xl font-mono text-red-400">
                  {lastRun.successfulBypasses}
                </div>
              </div>
            </div>

            {/* Vulnerability Grade */}
            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 mb-1">
                    Security Grade
                  </div>
                  <div
                    className={`text-4xl font-bold ${
                      getVulnerabilityGrade(lastRun.bypassRate).color
                    }`}
                  >
                    {getVulnerabilityGrade(lastRun.bypassRate).grade}
                  </div>
                  <div className="text-sm text-gray-400">
                    {getVulnerabilityGrade(lastRun.bypassRate).label}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Bypass Rate</div>
                  <div className="text-3xl font-mono text-white">
                    {lastRun.bypassRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Vulnerable Categories */}
          {lastRun.vulnerableCategories.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-lg p-4">
              <h4 className="text-sm font-mono text-red-400 mb-2">
                ⚠️ Vulnerable Categories
              </h4>
              <div className="space-y-1">
                {lastRun.vulnerableCategories.map((cat) => (
                  <div key={cat} className="text-sm text-red-300 font-mono">
                    • {cat}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Rules */}
          {lastRun.suggestedRules.length > 0 && (
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-mono text-blue-400 mb-3">
                💡 Suggested Rules ({lastRun.suggestedRules.length})
              </h4>
              <div className="space-y-3">
                {lastRun.suggestedRules.map((rule) => (
                  <SuggestedRuleCard key={rule.id} rule={rule} />
                ))}
              </div>
            </div>
          )}

          {/* Test Details */}
          <details className="bg-gray-950 border border-gray-800 rounded-lg">
            <summary className="p-4 cursor-pointer text-sm font-mono text-gray-400 hover:text-white">
              View Detailed Results ({lastRun.results.length} attacks)
            </summary>
            <div className="border-t border-gray-800 p-4 space-y-2 max-h-96 overflow-y-auto">
              {lastRun.results.map((result, idx) => (
                <div
                  key={result.attack.id}
                  className={`p-3 rounded border ${
                    result.bypassedDetection
                      ? 'bg-red-950 border-red-800'
                      : 'bg-gray-900 border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs text-gray-400">
                      Attack #{idx + 1} - {result.attack.technique}
                    </div>
                    <div
                      className={`text-xs font-mono ${
                        result.bypassedDetection
                          ? 'text-red-400'
                          : 'text-green-400'
                      }`}
                    >
                      {result.bypassedDetection ? '✗ BYPASSED' : '✓ DETECTED'}
                    </div>
                  </div>
                  <div className="text-sm text-white font-mono mb-2 break-words">
                    "{result.attack.promptText.substring(0, 150)}
                    {result.attack.promptText.length > 150 ? '...' : ''}"
                  </div>
                  <div className="text-xs text-gray-400">
                    Confidence: {result.scanResult.confidenceScore}% | Matches:{' '}
                    {result.scanResult.matchedRules}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {result.reasoning}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

/**
 * Suggested Rule Card Component
 */
function SuggestedRuleCard({ rule }: { rule: SuggestedRule }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-blue-900 border border-blue-700 rounded p-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-mono text-blue-200">{rule.name}</div>
          <div className="text-xs text-blue-400">
            {rule.type} | {rule.severity} | Confidence: {rule.confidence}%
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-300 hover:text-white"
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      </div>

      <div className="text-xs text-blue-300 mb-2">{rule.description}</div>

      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-blue-700 space-y-2">
          <div>
            <div className="text-xs text-blue-400">Rationale:</div>
            <div className="text-xs text-blue-200">{rule.rationale}</div>
          </div>

          {rule.keywords && (
            <div>
              <div className="text-xs text-blue-400">Keywords:</div>
              <div className="text-xs text-blue-200 font-mono">
                {rule.keywords.join(', ')}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-blue-400">
              Catches {rule.catchesAttacks.length} attack(s)
            </div>
          </div>

          <div className="flex space-x-2">
            <button className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded">
              Approve & Add
            </button>
            <button className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
