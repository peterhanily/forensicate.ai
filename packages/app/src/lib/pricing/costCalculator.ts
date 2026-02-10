/**
 * Cost calculation utilities
 */

import type { CostEstimate } from './types';
import { getPricing } from './pricingDatabase';

/**
 * Estimate token count from text
 * Uses rough approximation: ~4 characters per token
 * For more accuracy, would need provider-specific tokenizers (tiktoken, anthropic tokenizer)
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  // Rough estimate: 4 characters per token (works reasonably well for English)
  // More accurate would be:
  // - OpenAI: use tiktoken library
  // - Anthropic: use @anthropic-ai/tokenizer
  // - Others: similar approximations

  const charCount = text.length;
  const tokenEstimate = Math.ceil(charCount / 4);

  return tokenEstimate;
}

/**
 * Calculate cost for a single prompt
 */
export function calculateCost(
  promptText: string,
  provider: string,
  model: string,
  estimatedOutputTokens = 100 // Default: assume short responses for testing
): CostEstimate | null {
  const pricing = getPricing(provider, model);

  if (!pricing) {
    console.warn(`No pricing found for ${provider}/${model}`);
    return null;
  }

  const inputTokens = estimateTokenCount(promptText);

  // Calculate costs
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
  const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.outputCostPer1M;
  const totalCost = inputCost + outputCost;

  return {
    provider,
    model,
    displayName: pricing.displayName,
    inputTokens,
    estimatedOutputTokens,
    inputCost,
    outputCost,
    totalCost,
    source: pricing.source,
  };
}

/**
 * Calculate costs for multiple providers
 */
export function calculateMultiProviderCost(
  promptText: string,
  providers: Array<{ provider: string; model: string }>,
  estimatedOutputTokens = 100
): CostEstimate[] {
  return providers
    .map(({ provider, model }) =>
      calculateCost(promptText, provider, model, estimatedOutputTokens)
    )
    .filter((cost): cost is CostEstimate => cost !== null)
    .sort((a, b) => a.totalCost - b.totalCost); // Sort by cheapest first
}

/**
 * Calculate batch testing cost
 */
export function calculateBatchCost(
  prompts: string[],
  provider: string,
  model: string,
  estimatedOutputTokens = 100
): {
  totalCost: number;
  avgCostPerTest: number;
  totalInputTokens: number;
  testCount: number;
} | null {
  const pricing = getPricing(provider, model);

  if (!pricing) {
    return null;
  }

  let totalInputTokens = 0;
  let totalCost = 0;

  for (const prompt of prompts) {
    const inputTokens = estimateTokenCount(prompt);
    totalInputTokens += inputTokens;

    const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.outputCostPer1M;

    totalCost += inputCost + outputCost;
  }

  return {
    totalCost,
    avgCostPerTest: totalCost / prompts.length,
    totalInputTokens,
    testCount: prompts.length,
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.0001) return `$${cost.toFixed(6)}`; // Show more decimals for very small amounts
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}
