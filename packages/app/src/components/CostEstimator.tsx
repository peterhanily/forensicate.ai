/**
 * Cost Estimator Component - Bloomberg Terminal Style
 * Shows estimated API costs for prompts across different providers
 */

import { useState } from 'react';
import {
  calculateMultiProviderCost,
  formatCost,
  formatTokens,
  isPricingStale,
  type CostEstimate,
} from '../lib/pricing';

interface CostEstimatorProps {
  promptText: string;
  providers?: Array<{ provider: string; model: string }>; // If undefined, show all common providers
  mode?: 'single' | 'batch';
  batchSize?: number;
  className?: string;
}

// Default providers to show if none specified
const DEFAULT_PROVIDERS = [
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'anthropic', model: 'claude-haiku-4.5' },
  { provider: 'anthropic', model: 'claude-sonnet-4.5' },
  { provider: 'google', model: 'gemini-2.0-flash' },
];

export default function CostEstimator({
  promptText,
  providers = DEFAULT_PROVIDERS,
  mode = 'single',
  batchSize = 1,
  className = '',
}: CostEstimatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!promptText || promptText.trim().length === 0) {
    return null;
  }

  // Calculate costs for all providers
  const estimates = calculateMultiProviderCost(promptText, providers);

  if (estimates.length === 0) {
    return null;
  }

  const cheapest = estimates[0]; // Already sorted by cost
  const mostExpensive = estimates[estimates.length - 1];
  const totalMultiplier = mode === 'batch' ? batchSize : 1;

  // Check if pricing is stale for each provider
  const hasStaleData = estimates.some(e => isPricingStale(e.source.lastUpdated));

  return (
    <div className={`border border-gray-700 rounded-lg bg-black shadow-lg ${className}`}>
      {/* Collapsed Summary View - Terminal Style */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-900 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">💰</span>
          <div className="text-left">
            <div className="text-sm font-mono font-semibold text-[#c9a227]">
              COST ESTIMATE
              {mode === 'batch' && <span className="text-gray-500"> × {batchSize}</span>}
            </div>
            <div className="text-xs text-gray-400 font-mono">
              ~{formatTokens(cheapest.inputTokens)} tok
              {' │ '}
              <span className="font-bold text-green-400">
                {formatCost(cheapest.totalCost * totalMultiplier)}
              </span>
              {' '}
              <span className="text-gray-500">({cheapest.displayName})</span>
              {estimates.length > 1 && (
                <>
                  {' → '}
                  <span className="text-red-400 font-bold">
                    {formatCost(mostExpensive.totalCost * totalMultiplier)}
                  </span>
                  {' '}
                  <span className="text-gray-500">({mostExpensive.displayName})</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasStaleData && (
            <span
              className="text-xs text-yellow-500 animate-pulse"
              title="Some pricing data may be outdated"
            >
              ⚠
            </span>
          )}
          <svg
            className={`w-4 h-4 text-[#c9a227] transition-transform group-hover:text-yellow-300 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expanded Detail View - Bloomberg Terminal Style */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800 bg-gradient-to-b from-black to-gray-950">

          {/* CRITICAL DISCLAIMER - Make it VERY visible */}
          <div className="pt-3 bg-yellow-900/20 border border-yellow-700/50 rounded p-3 space-y-2">
            <div className="text-xs font-mono font-bold text-yellow-400 flex items-center gap-2">
              <span className="text-base">⚠️</span>
              ACCURACY DISCLAIMER
            </div>
            <div className="text-xs text-yellow-200/90 space-y-1 font-mono leading-relaxed">
              <div>• Token estimates use 4 char/token approximation (±25% variance typical)</div>
              <div>• Output tokens assumed at 100 (actual: 10-10,000+ depending on use case)</div>
              <div>• Prices manually verified {new Date(cheapest.source.lastUpdated).toLocaleDateString()} - may be outdated</div>
              <div>• Enterprise/volume pricing, regional variations, promotions NOT reflected</div>
              <div className="pt-1 text-yellow-300 font-semibold">
                → Use for ORDER-OF-MAGNITUDE estimation only, not budgeting
              </div>
            </div>
          </div>

          {/* Token breakdown - Terminal style */}
          <div className="text-xs font-mono space-y-1">
            <div className="text-[#c9a227] font-semibold mb-2">TOKEN ANALYSIS</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300 pl-2 border-l-2 border-gray-700">
              <div className="text-gray-500">INPUT:</div>
              <div className="text-green-400">~{cheapest.inputTokens.toLocaleString()} tokens</div>

              <div className="text-gray-500">OUTPUT (est):</div>
              <div className="text-green-400">~{cheapest.estimatedOutputTokens} tokens</div>

              <div className="text-gray-500">TOTAL:</div>
              <div className="text-green-400">
                ~{(cheapest.inputTokens + cheapest.estimatedOutputTokens).toLocaleString()} tokens
              </div>

              {mode === 'batch' && (
                <>
                  <div className="text-gray-500">BATCH SIZE:</div>
                  <div className="text-cyan-400">{batchSize} tests</div>

                  <div className="text-gray-500">TOTAL TOKENS:</div>
                  <div className="text-cyan-400">
                    ~{((cheapest.inputTokens + cheapest.estimatedOutputTokens) * batchSize).toLocaleString()}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Provider comparison - Terminal data grid */}
          <div>
            <div className="text-xs font-mono font-semibold text-[#c9a227] mb-2">
              PROVIDER RATES
            </div>

            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-mono text-gray-500 border-b border-gray-700 pb-1 mb-2">
              <div className="col-span-4">PROVIDER</div>
              <div className="col-span-3 text-right">IN/1M</div>
              <div className="col-span-3 text-right">OUT/1M</div>
              <div className="col-span-2 text-right">TOTAL</div>
            </div>

            {/* Provider rows */}
            <div className="space-y-1">
              {estimates.map((estimate, idx) => {
                const isStale = isPricingStale(estimate.source.lastUpdated);

                return (
                  <div
                    key={`${estimate.provider}-${estimate.model}`}
                    className={`grid grid-cols-12 gap-2 p-2 rounded font-mono text-xs border ${
                      idx === 0
                        ? 'bg-green-950/30 border-green-700/50 text-green-300'
                        : 'bg-gray-900/50 border-gray-800 text-gray-300'
                    }`}
                  >
                    {/* Provider name */}
                    <div className="col-span-4 flex items-center gap-1">
                      {idx === 0 && (
                        <span className="text-green-400 font-bold text-xs">★</span>
                      )}
                      <div>
                        <div className="font-semibold">{estimate.displayName}</div>
                        <div className="text-xs text-gray-500 capitalize flex items-center gap-1">
                          {estimate.provider}
                          {isStale && <span className="text-yellow-500">⚠</span>}
                        </div>
                      </div>
                    </div>

                    {/* Input cost */}
                    <div className="col-span-3 text-right text-xs text-gray-400">
                      ${estimate.source.lastUpdated ?
                        ((estimate.inputTokens / 1_000_000) *
                        (estimates.find(e => e.provider === estimate.provider && e.model === estimate.model)?.source.lastUpdated ?
                          getPricingFromEstimate(estimate).inputCostPer1M : 0)
                        ).toFixed(4)
                        : 'N/A'}
                    </div>

                    {/* Output cost */}
                    <div className="col-span-3 text-right text-xs text-gray-400">
                      ${estimate.outputCost.toFixed(4)}
                    </div>

                    {/* Total cost */}
                    <div className="col-span-2 text-right">
                      <div className={`font-bold ${idx === 0 ? 'text-green-400' : 'text-gray-200'}`}>
                        {formatCost(estimate.totalCost * totalMultiplier)}
                      </div>
                      {mode === 'batch' && totalMultiplier > 1 && (
                        <div className="text-xs text-gray-600">
                          {formatCost(estimate.totalCost)}/ea
                        </div>
                      )}
                    </div>

                    {/* Source link - EACH provider gets its own source */}
                    <div className="col-span-12 text-xs text-gray-600 pt-1 border-t border-gray-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">SRC:</span>
                        {estimate.source.url ? (
                          <a
                            href={estimate.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline font-mono"
                          >
                            {estimate.source.url.replace('https://', '').split('/')[0]}
                          </a>
                        ) : (
                          <span className="text-gray-600">manual entry</span>
                        )}
                        <span className="text-gray-700">│</span>
                        <span className={isStale ? 'text-yellow-500' : 'text-gray-500'}>
                          {new Date(estimate.source.lastUpdated).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      {isStale && (
                        <span className="text-yellow-500 text-xs">DATA STALE (&gt;60d)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Savings comparison - Terminal style */}
          {estimates.length > 1 && (
            <div className="bg-blue-950/30 border border-blue-700/50 rounded p-3">
              <div className="text-xs font-mono space-y-1">
                <div className="text-blue-400 font-semibold">💡 OPTIMIZATION</div>
                <div className="text-blue-200">
                  Switching: {mostExpensive.displayName} → {cheapest.displayName}
                </div>
                <div className="text-green-400 font-bold">
                  SAVES: {formatCost((mostExpensive.totalCost - cheapest.totalCost) * totalMultiplier)}
                  {' '}
                  ({Math.round(((mostExpensive.totalCost - cheapest.totalCost) / mostExpensive.totalCost) * 100)}% reduction)
                </div>
              </div>
            </div>
          )}

          {/* Methodology disclosure */}
          <div className="pt-2 border-t border-gray-800 text-xs font-mono text-gray-600 space-y-1">
            <div className="text-gray-500 font-semibold">METHODOLOGY:</div>
            <div className="text-gray-600 pl-2 space-y-0.5">
              <div>• Character count ÷ 4 = rough token estimate</div>
              <div>• Provider tokenizers (tiktoken, anthropic) more accurate</div>
              <div>• Output estimate fixed at 100 tokens (arbitrary assumption)</div>
              <div>• Pricing manually scraped from provider websites</div>
              <div>• No API calls to verify live pricing</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to extract pricing from estimate (for display purposes)
function getPricingFromEstimate(estimate: CostEstimate): { inputCostPer1M: number; outputCostPer1M: number } {
  // Back-calculate from the costs
  const inputCostPer1M = estimate.inputTokens > 0
    ? (estimate.inputCost / estimate.inputTokens) * 1_000_000
    : 0;
  const outputCostPer1M = estimate.estimatedOutputTokens > 0
    ? (estimate.outputCost / estimate.estimatedOutputTokens) * 1_000_000
    : 0;

  return { inputCostPer1M, outputCostPer1M };
}
