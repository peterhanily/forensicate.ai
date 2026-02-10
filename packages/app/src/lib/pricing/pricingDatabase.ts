/**
 * LLM Pricing Database
 *
 * Sources verified as of February 2026
 * Prices in USD per 1M tokens
 */

import type { ModelPricing } from './types';

// Last updated date for all pricing data
const PRICING_LAST_UPDATED = '2026-02-10T00:00:00Z';

/**
 * Hardcoded pricing database with official sources
 * This serves as fallback and will be supplemented by automated fetching
 */
export const PRICING_DATABASE: ModelPricing[] = [
  // OpenAI - https://openai.com/api/pricing/
  {
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Most capable model, multimodal',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Fast, affordable, intelligent',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    inputCostPer1M: 0.50,
    outputCostPer1M: 1.50,
    contextWindow: 16385,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Fast and inexpensive',
  },

  // Anthropic Claude - https://www.anthropic.com/pricing
  {
    provider: 'anthropic',
    model: 'claude-opus-4.6',
    displayName: 'Claude Opus 4.6',
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Most powerful model',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4.5',
    displayName: 'Claude Sonnet 4.5',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Balanced performance and speed',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4.5',
    displayName: 'Claude Haiku 4.5',
    inputCostPer1M: 0.80,
    outputCostPer1M: 4.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Fastest and most compact',
  },

  // Google Gemini - https://ai.google.dev/pricing
  {
    provider: 'google',
    model: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    contextWindow: 1000000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Fastest with multimodal support',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00,
    contextWindow: 2000000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Most capable with 2M context',
  },

  // Mistral - https://mistral.ai/technology/#pricing
  {
    provider: 'mistral',
    model: 'mistral-large-latest',
    displayName: 'Mistral Large',
    inputCostPer1M: 2.00,
    outputCostPer1M: 6.00,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/technology/#pricing',
      verifiedBy: 'manual',
    },
    notes: 'Flagship model',
  },
  {
    provider: 'mistral',
    model: 'mistral-small-latest',
    displayName: 'Mistral Small',
    inputCostPer1M: 0.20,
    outputCostPer1M: 0.60,
    contextWindow: 32000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/technology/#pricing',
      verifiedBy: 'manual',
    },
    notes: 'Cost-effective for simple tasks',
  },

  // Perplexity - https://docs.perplexity.ai/docs/pricing
  {
    provider: 'perplexity',
    model: 'sonar-pro',
    displayName: 'Sonar Pro',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    contextWindow: 127000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://docs.perplexity.ai/docs/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Real-time web search integration',
  },

  // Ollama (local) - Free but compute costs
  {
    provider: 'ollama',
    model: 'llama3.1:latest',
    displayName: 'Llama 3.1 (Local)',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ollama.com/library',
      verifiedBy: 'manual',
    },
    notes: 'Free local inference (compute costs only)',
  },
];

/**
 * Get pricing for a specific model
 */
export function getPricing(provider: string, model: string): ModelPricing | undefined {
  return PRICING_DATABASE.find(
    p => p.provider === provider && p.model === model
  );
}

/**
 * Get all pricing for a provider
 */
export function getProviderPricing(provider: string): ModelPricing[] {
  return PRICING_DATABASE.filter(p => p.provider === provider);
}

/**
 * Get all available providers
 */
export function getAllProviders(): string[] {
  return Array.from(new Set(PRICING_DATABASE.map(p => p.provider)));
}

/**
 * Check if pricing data is stale (>60 days old)
 */
export function isPricingStale(lastUpdated: string, maxAgeDays = 60): boolean {
  const age = Date.now() - new Date(lastUpdated).getTime();
  const ageInDays = age / (1000 * 60 * 60 * 24);
  return ageInDays > maxAgeDays;
}
