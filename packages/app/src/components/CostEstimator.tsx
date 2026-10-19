/**
 * Cost Estimator Component - Bloomberg Terminal Style
 * Shows estimated API costs for prompts across different providers
 */

import { useState, memo } from 'react';
import {
 calculateMultiProviderCost,
 formatCost,
 formatTokens,
 getPricingStatus,
 DEFAULT_PRICING_MODELS,
} from '../lib/pricing';

interface CostEstimatorProps {
 promptText: string;
 providers?: Array<{ provider: string; model: string }>; // If undefined, show all common providers
 mode?: 'single' | 'batch';
 batchSize?: number;
 className?: string;
}

function CostEstimator({
 promptText,
 providers = DEFAULT_PRICING_MODELS,
 mode = 'single',
 batchSize = 1,
 className = '',
}: CostEstimatorProps) {
 const [isExpanded, setIsExpanded] = useState(false);
 const [isDisclaimerExpanded, setIsDisclaimerExpanded] = useState(false);
 const [showAllModels, setShowAllModels] = useState(false);

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
 const hasUncertainData = estimates.some(e => getPricingStatus(e.source) !== 'verified');

 return (
 <div className={`border border-gray-700 rounded-lg bg-black shadow-lg ${className}`}>
 {/* Collapsed Summary View - Terminal Style */}
 <button
 onClick={() => setIsExpanded(!isExpanded)}
 aria-expanded={isExpanded}
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
 {hasUncertainData && (
 <span
 className="text-xs text-yellow-500 animate-pulse"
 title="Some rates are stale or unverified"
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

 {/* DISCLAIMER - Collapsible */}
 <div className="pt-3">
 <button
 onClick={() => setIsDisclaimerExpanded(!isDisclaimerExpanded)}
 aria-expanded={isDisclaimerExpanded}
 className="w-full bg-yellow-900/20 border border-yellow-700/50 rounded p-2 hover:bg-yellow-900/30 transition-colors"
 >
 <div className="flex items-center justify-between">
 <div className="text-xs font-mono font-bold text-yellow-400 flex items-center gap-2">
 <span className="text-base">⚠️</span>
 ACCURACY DISCLAIMER
 </div>
 <svg
 className={`w-3 h-3 text-yellow-400 transition-transform ${
 isDisclaimerExpanded ? 'rotate-180' : ''
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
 {isDisclaimerExpanded && (
 <div className="bg-yellow-900/20 border border-yellow-700/50 border-t-0 rounded-b px-3 pb-3 pt-2">
 <div className="text-xs text-yellow-200/90 space-y-1 font-mono leading-relaxed">
 <div>• Token estimates use 4 characters per token; accuracy varies by language and tokenizer</div>
 <div>• Output assumes 100 billable tokens, including any reasoning tokens; actual use can be much higher</div>
 <div>• Verification dates apply per model and appear with each source below</div>
 <div>• Standard, uncached text rates in USD. Cache, batch and volume discounts, tools, search/request fees, taxes and regional surcharges are excluded</div>
 <div className="pt-1 text-yellow-300 font-semibold">
 → Use for ORDER-OF-MAGNITUDE estimation only, not budgeting
 </div>
 </div>
 </div>
 )}
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
 <div className="flex items-center justify-between mb-2">
 <div className="text-xs font-mono font-semibold text-[#c9a227]">
 PROVIDER RATES
 </div>
 <button
 onClick={() => setShowAllModels(!showAllModels)}
 className="text-xs font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
 >
 {showAllModels ? (
 <>
 <span>Show First 5 Only</span>
 <svg className="w-3 h-3 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
 </svg>
 </>
 ) : (
 <>
 <span>Show All {estimates.length} Models</span>
 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
 </svg>
 </>
 )}
 </button>
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
 const pricingStatus = getPricingStatus(estimate.source);
 const isUncertain = pricingStatus !== 'verified';
 const isFirstFive = idx < 5;
 const shouldShow = showAllModels || isFirstFive;

 if (!shouldShow) return null;

 return (
 <div
 key={`${estimate.provider}-${estimate.model}`}
 className={`grid grid-cols-12 gap-2 p-2 rounded font-mono text-xs border ${
 idx === 0
 ? 'bg-green-950/30 border-green-700/50 text-green-300'
 : isFirstFive
 ? 'bg-blue-950/20 border-blue-800/50 text-gray-300'
 : 'bg-gray-900/50 border-gray-800 text-gray-300'
 }`}
 >
 {/* Provider name */}
 <div className="col-span-4 flex items-center gap-1">
 {idx === 0 && (
 <span className="text-green-400 font-bold text-xs">★</span>
 )}
 <div className="flex-1">
 <div className="font-semibold flex items-center gap-1">
 {estimate.displayName}
 </div>
 <div className="text-xs text-gray-500 capitalize flex items-center gap-1">
 {estimate.provider}
 {isUncertain && <span className="text-yellow-500">⚠</span>}
 {estimate.status && <span className="text-yellow-500">{estimate.status}</span>}
 </div>
 </div>
 </div>

 {/* Input cost */}
 <div className="col-span-3 text-right text-xs text-gray-400">
 ${estimate.inputCostPer1M.toFixed(2)}
 </div>

 {/* Output cost */}
 <div className="col-span-3 text-right text-xs text-gray-400">
 ${estimate.outputCostPer1M.toFixed(2)}
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

 {estimate.notes && <div className="col-span-12 text-gray-400">{estimate.notes}</div>}

 {/* Each rate has its own verification date and source. */}
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
 <span className={isUncertain ? 'text-yellow-500' : 'text-gray-500'}>
 {estimate.source.verifiedAt ? 'Verified ' : 'Recorded '}
 {new Date(estimate.source.verifiedAt ?? estimate.source.lastUpdated).toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: 'numeric',
 timeZone: 'UTC',
 })}
 </span>
 </div>
 {isUncertain && (
 <span className="text-yellow-500 text-xs">{pricingStatus === 'stale' ? 'DATA STALE (>30d)' : 'UNVERIFIED RATE'}</span>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>

 {/* Compare the selected rates without recommending a model switch. */}
 {estimates.length > 1 && (
 <div className="bg-blue-950/30 border border-blue-700/50 rounded p-3">
 <div className="text-xs font-mono space-y-1">
 <div className="text-blue-400 font-semibold">ESTIMATED COST DIFFERENCE</div>
 <div className="text-blue-200">
 Selected models: {mostExpensive.displayName} → {cheapest.displayName}
 </div>
 <div className="text-green-400 font-bold">
 Difference: {formatCost((mostExpensive.totalCost - cheapest.totalCost) * totalMultiplier)}
 {' '}
 ({mostExpensive.totalCost > 0 ? Math.round(((mostExpensive.totalCost - cheapest.totalCost) / mostExpensive.totalCost) * 100) : 0}% of the higher estimate)
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
 <div>• Output estimate fixed at 100 billable tokens, including reasoning</div>
 <div>• Batch size multiplies standard request cost; provider Batch API discounts are not applied</div>
 <div>• Manually maintained rates; this is a selected comparison, not a complete model catalog or quality ranking</div>
 <div>• No live pricing or model-availability check; use each source for current billing details</div>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

export default memo(CostEstimator);
