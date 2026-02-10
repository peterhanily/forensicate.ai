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
    model: 'gpt-5.2-pro',
    displayName: 'GPT-5.2 Pro',
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Latest flagship with xhigh reasoning (90% cache discount)',
  },
  {
    provider: 'openai',
    model: 'gpt-5.2',
    displayName: 'GPT-5.2',
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Latest model with thinking mode (90% cache discount)',
  },
  {
    provider: 'openai',
    model: 'gpt-5.1',
    displayName: 'GPT-5.1',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Adaptive reasoning (faster on simple tasks)',
  },
  {
    provider: 'openai',
    model: 'gpt-5',
    displayName: 'GPT-5',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Flagship model (released August 2025)',
  },
  {
    provider: 'openai',
    model: 'o1-preview',
    displayName: 'o1-preview',
    inputCostPer1M: 15.00,
    outputCostPer1M: 60.00,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Original o1 reasoning model (legacy)',
  },
  {
    provider: 'openai',
    model: 'o1-mini',
    displayName: 'o1-mini',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Cost-efficient reasoning (80% cheaper than o1-preview)',
  },
  {
    provider: 'openai',
    model: 'o3-mini',
    displayName: 'o3-mini',
    inputCostPer1M: 1.10,
    outputCostPer1M: 4.40,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Higher intelligence at same latency/price as o1-mini',
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    inputCostPer1M: 10.00,
    outputCostPer1M: 30.00,
    contextWindow: 128000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Legacy Turbo model (superseded by GPT-4o)',
  },
  {
    provider: 'openai',
    model: 'gpt-4',
    displayName: 'GPT-4',
    inputCostPer1M: 30.00,
    outputCostPer1M: 60.00,
    contextWindow: 8192,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://openai.com/api/pricing/',
      verifiedBy: 'manual',
    },
    notes: 'Original GPT-4 (legacy)',
  },
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
    notes: 'Most capable multimodal model',
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
    notes: 'Legacy fast and inexpensive model',
  },

  // Anthropic Claude - https://www.anthropic.com/pricing
  {
    provider: 'anthropic',
    model: 'claude-opus-4.5',
    displayName: 'Claude Opus 4.5',
    inputCostPer1M: 5.00,
    outputCostPer1M: 25.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Most capable model (66% cheaper than v4.1)',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus',
    displayName: 'Claude 3 Opus',
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Legacy Claude 3 flagship',
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
    notes: 'Balanced performance and speed (<200K context)',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4.5',
    displayName: 'Claude Haiku 4.5',
    inputCostPer1M: 1.00,
    outputCostPer1M: 5.00,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Fastest and most compact',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku',
    displayName: 'Claude 3 Haiku',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    contextWindow: 200000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://www.anthropic.com/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Legacy Claude 3 fast model (very cheap)',
  },

  // Google Gemini - https://ai.google.dev/pricing
  {
    provider: 'google',
    model: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00,
    contextWindow: 2000000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Newest flagship with 2M context window',
  },
  {
    provider: 'google',
    model: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    contextWindow: 1000000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Best for coding tasks',
  },
  {
    provider: 'google',
    model: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    contextWindow: 1000000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Hybrid reasoning with speed (thinking enabled)',
  },
  {
    provider: 'google',
    model: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
    contextWindow: 1000000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://ai.google.dev/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Most economical for high-volume tasks',
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
    notes: 'Legacy model with 2M context',
  },

  // Mistral - https://mistral.ai/pricing
  {
    provider: 'mistral',
    model: 'mistral-large-2411',
    displayName: 'Mistral Large 2411',
    inputCostPer1M: 2.00,
    outputCostPer1M: 6.00,
    contextWindow: 131000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Flagship model (Nov 2024)',
  },
  {
    provider: 'mistral',
    model: 'mistral-medium-3',
    displayName: 'Mistral Medium 3',
    inputCostPer1M: 0.40,
    outputCostPer1M: 2.00,
    contextWindow: 131000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Balanced model (May 2025)',
  },
  {
    provider: 'mistral',
    model: 'mistral-small-3.1',
    displayName: 'Mistral Small 3.1',
    inputCostPer1M: 0.03,
    outputCostPer1M: 0.11,
    contextWindow: 131000,
    source: {
      type: 'fallback',
      lastUpdated: PRICING_LAST_UPDATED,
      url: 'https://mistral.ai/pricing',
      verifiedBy: 'manual',
    },
    notes: 'Most cost-effective',
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
